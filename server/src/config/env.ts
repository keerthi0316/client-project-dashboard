import 'dotenv/config'; import {z} from 'zod';
const schema=z.object({DATABASE_URL:z.string().min(1),JWT_ACCESS_SECRET:z.string().min(16),JWT_REFRESH_SECRET:z.string().min(16),ACCESS_TOKEN_EXPIRES_IN:z.string().default('15m'),REFRESH_TOKEN_EXPIRES_IN:z.string().default('7d'),CLIENT_URL:z.string().url().default('http://localhost:5173'),PORT:z.coerce.number().default(4000),NODE_ENV:z.enum(['development','test','production']).default('development')});
export const env=schema.parse(process.env);
