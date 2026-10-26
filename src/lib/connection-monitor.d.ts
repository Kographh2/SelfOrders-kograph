export type ConnectionState={status:'online'|'offline'|'checking'|'unavailable';message:string;checkedAt:number|null};
export function createConnectionMonitor(options:{mode?:'offline'|'error';automatic?:boolean;onState:(state:ConnectionState)=>void;onRecovered:()=>void;verify?:(signal:AbortSignal)=>Promise<boolean>}):{check:()=>Promise<boolean>;getState:()=>ConnectionState;dispose:()=>void};
