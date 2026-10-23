// Map insertion order is recency order. Never evict a displayed room, a room
// being entered, or in-flight resources that another preparation still awaits.
export function retainPreparedRooms(entries,{active,requested,protectedKeys=new Set(),limit=2}={}){
 for(const [key,entry]of entries){
  if(entries.size<=limit)break;
  if(key!==active&&key!==requested&&!protectedKeys.has(key)&&entry.settled)entries.delete(key);
 }
}
