import * as vscode from 'vscode';
import { CONFIG } from '../constants';
import { t } from '../i18n';
import { CaptureError, captureWorklogAuth } from './capture';
import { postWorklog } from './client';
import { DEFAULT_WORKLOG_API, SECRET } from './constants';
import { buildWorklogPayload, parseWorkItem, validateWorklogInput, type WorklogSubmitInput } from './payload';

export class WorklogService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: (message: string) => void,
  ) {}

  async login(): Promise<void> {
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('worklog.loginHint') },
        async () => {
          const auth = await this.capture(true);
          await this.saveAuth(auth);
          if (!auth.userId && !(await this.resolveUserId())) {
            throw new Error(t('worklog.needUserId'));
          }
        },
      );
    } catch (error) {
      throw this.asUserError(error);
    }
    void vscode.window.showInformationMessage(t('worklog.loginOk'));
  }

  async enterUserId(): Promise<void> {
    const current = await this.resolveUserId();
    const value = await vscode.window.showInputBox({
      title: t('worklog.enterUserId'),
      prompt: t('worklog.enterUserIdPrompt'),
      placeHolder: t('worklog.enterUserIdPlaceholder'),
      value: current,
      ignoreFocusOut: true,
      validateInput: (raw) => {
        const id = raw.trim();
        if (!id) {
          return t('worklog.enterUserIdRequired');
        }
        if (!/^(\d{10,24}|ou_[a-zA-Z0-9]+)$/.test(id)) {
          return t('worklog.enterUserIdInvalid');
        }
        return undefined;
      },
    });
    if (value === undefined) {
      return;
    }
    const id = value.trim();
    await this.context.secrets.store(SECRET.userId, id);
    await vscode.workspace.getConfiguration().update(CONFIG.worklogUserId, id, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(t('worklog.enterUserIdOk'));
  }

  async submit(input: WorklogSubmitInput): Promise<string> {
    const invalid = validateWorklogInput(input);
    if (invalid) {
      throw new Error(invalid);
    }
    const task = parseWorkItem(input.workItem);
    if (!task) {
      throw new Error(t('worklog.needWorkItem'));
    }

    let key = (await this.context.secrets.get(SECRET.key)) ?? '';
    let userId = await this.resolveUserId();
    let apiUrl = (await this.context.secrets.get(SECRET.api)) || DEFAULT_WORKLOG_API;

    const ensureAuth = async (headful: boolean) => {
      const auth = await this.capture(headful);
      await this.saveAuth(auth);
      key = auth.key;
      userId = auth.userId || userId;
      apiUrl = auth.apiUrl || apiUrl;
    };

    if (!key) {
      try {
        await ensureAuth(false);
      } catch (error) {
        if (this.canRetryHeadful(error)) {
          this.log('headless sniff failed, opening login window');
          await this.captureWithProgress(true, ensureAuth);
        } else {
          throw this.asUserError(error);
        }
      }
    }

    if (!userId) {
      this.log('missing user_id, opening login window');
      try {
        await this.captureWithProgress(true, ensureAuth);
      } catch (error) {
        if (key) {
          throw new Error(t('worklog.needUserId'));
        }
        throw this.asUserError(error);
      }
    }

    if (!key) {
      throw new Error(t('worklog.captureTimeout'));
    }
    if (!userId) {
      throw new Error(t('worklog.needUserId'));
    }

    const payload = buildWorklogPayload(input, userId);
    this.log(`POST worklog work_item=${task.workItemId} minutes=${Math.round(input.minutes)}`);
    let result = await postWorklog({ apiUrl, key, payload });
    if (result.status === 401) {
      this.log('401, refreshing x-worklog-key once');
      try {
        await ensureAuth(false);
      } catch (error) {
        if (this.canRetryHeadful(error)) {
          await this.captureWithProgress(true, ensureAuth);
        } else {
          throw this.asUserError(error);
        }
      }
      if (!key || !userId) {
        throw new Error(t('worklog.unauthorized'));
      }
      result = await postWorklog({
        apiUrl,
        key,
        payload: buildWorklogPayload(input, userId),
      });
    }
    if (!result.ok) {
      throw new Error(this.localizeApiError(result.status, result.message));
    }
    return result.id || `ok:${Date.now()}`;
  }

  private localizeApiError(status: number, message: string): string {
    const text = message.trim();
    if (
      status === 401 ||
      /没有相关权限|请登录|unauthorized|not logged in|no permission/i.test(text)
    ) {
      return t('worklog.apiUnauthorized');
    }
    if (/开始时间不能是未来时间|cannot be in the future|future time/i.test(text)) {
      return t('worklog.apiFutureTime');
    }
    return text || t('worklog.submitFailed');
  }

  private canRetryHeadful(error: unknown): boolean {
    return error instanceof CaptureError && (error.kind === 'timeout' || error.kind === 'cdp');
  }

  private asUserError(error: unknown): Error {
    if (error instanceof CaptureError) {
      if (error.kind === 'chrome') {
        return new Error(t('worklog.needChrome'));
      }
      if (error.kind === 'timeout' || error.kind === 'cdp') {
        return new Error(t('worklog.captureTimeout'));
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private async captureWithProgress(
    headful: boolean,
    ensureAuth: (headful: boolean) => Promise<void>,
  ): Promise<void> {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t('worklog.loginHint') },
      () => ensureAuth(headful),
    );
  }

  private async capture(headful: boolean) {
    try {
      return await captureWorklogAuth({
        headful,
        log: (message) => this.log(message),
      });
    } catch (error) {
      if (error instanceof CaptureError && error.kind === 'chrome') {
        throw new Error(t('worklog.needChrome'));
      }
      throw error;
    }
  }

  private async saveAuth(auth: { key: string; userId?: string; apiUrl?: string }): Promise<void> {
    await this.context.secrets.store(SECRET.key, auth.key);
    if (auth.userId) {
      await this.context.secrets.store(SECRET.userId, auth.userId);
    }
    if (auth.apiUrl) {
      await this.context.secrets.store(SECRET.api, auth.apiUrl);
    }
  }

  private async resolveUserId(): Promise<string> {
    const fromSecret = (await this.context.secrets.get(SECRET.userId))?.trim();
    if (fromSecret) {
      return fromSecret;
    }
    return vscode.workspace.getConfiguration().get<string>(CONFIG.worklogUserId, '')?.trim() ?? '';
  }
}
