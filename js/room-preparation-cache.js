// Map insertion order is recency order. Never evict a displayed room, a room
// being entered, or in-flight resources that another preparation still awaits.
export function retainPreparedRooms(entries,{active,requested,limit=2}={}){
 for(const [key,entry]of entries){
  if(entries.size<=limit)break;
  if(key!==active&&key!==requested&&entry.settled)entries.delete(key);
 }
}
