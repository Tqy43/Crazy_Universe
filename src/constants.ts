export const VIEW_CONTAINER = 'crazyUniverse';

export const VIEWS = {
  tasks: 'crazyUniverse.tasks',
  timeline: 'crazyUniverse.timeline',
} as const;

export const COMMANDS = {
  newTask: 'crazyUniverse.newTask',
  startTask: 'crazyUniverse.startTask',
  pauseTask: 'crazyUniverse.pauseTask',
  resumeTask: 'crazyUniverse.resumeTask',
  completeTask: 'crazyUniverse.completeTask',
  addNote: 'crazyUniverse.addNote',
  openTimeline: 'crazyUniverse.openTimeline',
  focus: 'crazyUniverse.focus',
  filterTasks: 'crazyUniverse.filterTasks',
  filterTimeline: 'crazyUniverse.filterTimeline',
  deleteTask: 'crazyUniverse.deleteTask',
  renameTask: 'crazyUniverse.renameTask',
  statusBarPick: 'crazyUniverse.statusBarPick',
} as const;

export const CONTEXT = {
  hasTasks: 'crazyUniverse.hasTasks',
  hasSelection: 'crazyUniverse.hasSelection',
  selectionStatus: 'crazyUniverse.selectionStatus',
  hasActiveTask: 'crazyUniverse.hasActiveTask',
} as const;

export const CONFIG = {
  includeOpenFiles: 'crazyUniverse.snapshot.includeOpenFiles',
  includeChangedPaths: 'crazyUniverse.snapshot.includeChangedPaths',
} as const;

export const OUTPUT_CHANNEL = 'Crazy Universe';
