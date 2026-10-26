/** Exhaust a bounded result in stable pages; never silently accept a truncated report. */
export async function readPages<T>(query: (from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>, maximum=20000):Promise<T[]> {
  const rows:T[]=[];
  for(let offset=0;offset<maximum;offset+=500){
    const result=await query(offset,offset+499);
    if(result.error)throw new Error(result.error.message);
    rows.push(...(result.data||[]));
    if(!result.data || result.data.length<500)return rows;
  }
  throw new Error("Data terlalu banyak. Persempit rentang tanggal laporan.");
}
