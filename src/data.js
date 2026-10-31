// Supabase caps a single response; page through history for complete rankings.
export async function loadAllRows(db,table,sortColumn) {
 const rows=new Map();
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from(table).select('*').order(sortColumn).order('id').range(offset,offset+499);
  if(error)throw error;
  for(const row of data)rows.set(row.id,row);
  if(data.length<500)return [...rows.values()];
 }
}
