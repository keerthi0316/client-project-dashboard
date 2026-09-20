import jwt from 'jsonwebtoken'; import crypto from 'crypto'; import {env} from '../config/env';
export type AccessPayload={sub:string,role:string};
export const signAccess=(p:AccessPayload)=>jwt.sign(p,env.JWT_ACCESS_SECRET,{expiresIn:env.ACCESS_TOKEN_EXPIRES_IN});
export const signRefresh=(id:string)=>jwt.sign({sub:id,jti:crypto.randomUUID()},env.JWT_REFRESH_SECRET,{expiresIn:env.REFRESH_TOKEN_EXPIRES_IN});
export const verifyAccess=(t:string)=>jwt.verify(t,env.JWT_ACCESS_SECRET) as AccessPayload;
export const verifyRefresh=(t:string)=>jwt.verify(t,env.JWT_REFRESH_SECRET) as {sub:string,jti:string};
export const hashToken=(t:string)=>crypto.createHash('sha256').update(t).digest('hex');
