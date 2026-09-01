import * as vscode from 'vscode';
import { CONFIG } from '../constants';
import { t } from '../i18n';
import { CaptureError, captureWorklogAuth } from './capture';
import { postWorklog } from './client';
import { DEFAULT_WORKLOG_API, SECRET } from './constants';
import { buildWorklogPayload, parseWorkItem, type WorklogSubmitInput } from './payload';

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

  async submit(input: WorklogSubmitInput): Promise<string> {
    const task = parseWorkItem(input.workItem);
    if (!task) {
      throw new Error(t('worklog.needWorkItem'));
    }
    if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
      throw new Error(t('worklog.needMinutes'));
    }
    if (!input.startedAt || Number.isNaN(Date.parse(input.startedAt))) {
      throw new Error(t('worklog.needStarted'));
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
      throw new Error(result.message || t('worklog.submitFailed'));
    }
    return result.id || `ok:${Date.now()}`;
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
