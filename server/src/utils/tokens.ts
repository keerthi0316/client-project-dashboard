import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export type AccessPayload = {
  sub: string;
  role: string;
};

export const signAccess = (payload: AccessPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn']
  });

export const verifyAccess = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;

export const signRefresh = (userId: string) =>
  jwt.sign(
    {
      sub: userId,
      jti: crypto.randomUUID()
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn:
        env.REFRESH_TOKEN_EXPIRES_IN as jwt.SignOptions['expiresIn']
    }
  );

export const verifyRefresh = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as {
    sub: string;
    jti: string;
  };

export const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');