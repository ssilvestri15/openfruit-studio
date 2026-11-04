export type StudioUpdateChannel = 'preview' | 'stable';
export type StudioUpdatePreference = StudioUpdateChannel | 'auto';

export interface StudioUpdate {
  version: string;
  releaseUrl: string;
}

export type StudioUpdateResult =
  | { status: 'available'; update: StudioUpdate }
  | { status: 'current' | 'unavailable' };

export type StudioUpdateState = StudioUpdateResult & {
  version: string;
  channel: StudioUpdateChannel;
};

export interface StudioUpdateApi {
  checkStudioUpdate(refresh?: boolean): Promise<StudioUpdateState>;
  openStudioUpdate(): Promise<void>;
}
