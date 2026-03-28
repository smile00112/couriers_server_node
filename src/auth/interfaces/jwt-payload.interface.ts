export interface JwtPayload {
  sub: string;
  owner_id: string;
  role: string;
}

export interface AuthUser {
  courierId: string;
  ownerId: string;
  role: string;
}
