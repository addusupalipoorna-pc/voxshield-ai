export type UserRole = 'USER' | 'SECURITY_ANALYST' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified?: boolean;
  phone_verified?: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}
