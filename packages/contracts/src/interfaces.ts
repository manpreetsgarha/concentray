export interface AuthSession {
  accessToken: string;
  expiresAt?: string;
  idToken?: string;
}

export interface AuthProvider {
  signIn(): Promise<AuthSession>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string>;
}

export interface Uploadable {
  uri: string;
  mimeType: string;
  name: string;
}

export interface DriveFileRef {
  fileId: string;
  link: string;
}

export interface FileProvider {
  upload(file: Uploadable, taskId: string): Promise<DriveFileRef>;
}
