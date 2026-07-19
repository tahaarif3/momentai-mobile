/** Shared in-memory app state for the scaffold. */

export const state = {
  authConfigured: false,
  session: null,
  stagedPhoto: null,
  stagedFile: null,
  customPrompt: '',
  moodChip: '',
  activeJobId: null,
  progressToken: null,
  generation: {
    title: '',
    tracks: [],
    imagePath: null,
    id: null,
  },
};

const JOB_KEY = 'momentai.activeJob';

export function persistActiveJob() {
  try {
    if (!state.activeJobId) {
      localStorage.removeItem(JOB_KEY);
      return;
    }
    localStorage.setItem(
      JOB_KEY,
      JSON.stringify({
        jobId: state.activeJobId,
        progressToken: state.progressToken,
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function restoreActiveJob() {
  try {
    const raw = localStorage.getItem(JOB_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
