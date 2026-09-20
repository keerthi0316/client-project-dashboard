import {Role} from '@prisma/client'; import {Request} from 'express'; export type AuthUser={id:string,role:Role}; export type AuthRequest=Request & {user?:AuthUser};
