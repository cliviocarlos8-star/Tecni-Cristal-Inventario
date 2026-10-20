import {supabase} from '../../lib/supabase';
import {mergeState, VERSION, type LearningState} from './model';
const key=(id:string)=>`tc-learning:${id}`;
export function readLocal(id:string):LearningState {
  try {return JSON.parse(localStorage.getItem(key(id)) || 'null') || {version:VERSION};}
  catch {return {version:VERSION};}
}
export function saveLocal(id:string,state:LearningState) {
  try {localStorage.setItem(key(id),JSON.stringify(state));}catch { /* Storage may be disabled. Account storage still works. */ }
}
export async function saveAccount(id:string,state:LearningState):Promise<LearningState|null> {
  const {data}=await supabase.auth.getUser();
  if(data.user?.id!==id)return null;
  const merged=mergeState(data.user.user_metadata?.tc_learning || {version:VERSION},state);
  const {error}=await supabase.auth.updateUser({data:{tc_learning:merged}});
  return error ? null : merged;
}
