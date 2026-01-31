export const must=(n:string)=>{const v=process.env[n]; if(!v) throw new Error(`Missing env: ${n}`); return v;};
