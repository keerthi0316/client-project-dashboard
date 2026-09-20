export class AppError extends Error { constructor(public status:number, public code:string, message:string){super(message)} }
export const asyncHandler=(fn:any)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res,next)).catch(next);
