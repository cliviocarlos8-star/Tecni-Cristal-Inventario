"use client";
import {createContext, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {supabase} from '../../lib/supabase';
import {mergeState, shouldStart, VERSION, hints, type LearningState, type Role} from './model';
import {readLocal, saveLocal, saveAccount} from './persistence';
import Onboarding from './view';
const Context=createContext<{open:()=>void;dismiss:(id:string)=>void;state:LearningState;ready:boolean;visible:boolean}>({open:()=>{},dismiss:()=>{},state:{version:VERSION},ready:false,visible:false});
export default function LearningProvider({children}:{children:ReactNode}) {
  const [account,setAccount]=useState<{id:string;role:Role}|null>(null);
  const [state,setState]=useState<LearningState>({version:VERSION});
  const [visible,setVisible]=useState(false);
  const current=useRef<LearningState>({version:VERSION});
  const accountId=useRef<string|null>(null);
  const queue=useRef(Promise.resolve());
  function persist(patch:Partial<LearningState>) {
    const id=accountId.current;if(!id)return Promise.resolve();
    const next=mergeState(current.current,{...patch,version:VERSION});
    current.current=next;setState(next);saveLocal(id,next);
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      if(accountId.current!==id)return;
      const merged=await saveAccount(id,next);
      if(merged&&accountId.current===id){current.current=mergeState(current.current,merged);setState(current.current);saveLocal(id,current.current);}
    }).catch(()=>{});
    return queue.current;
  }
  useEffect(()=>{
    let live=true,generation=0;
    const load=async()=>{
      const ticket=++generation;
      const {data}=await supabase.auth.getSession();
      if(accountId.current===data.session?.user.id)return;
      const verified=data.session ? await supabase.auth.getUser() : null;
      const user=verified?.data.user || data.session?.user;
      if(!live||ticket!==generation)return;
      if(!user){accountId.current=null;setAccount(null);setVisible(false);return;}
      accountId.current=null;setAccount(null);setVisible(false);
      const {data:profile}=await supabase.from('profiles').select('role,active').eq('user_id',user.id).single();
      if(!live||ticket!==generation||!profile?.active)return;
      accountId.current=user.id;setAccount({id:user.id,role:profile.role});
      const remote=user.user_metadata?.tc_learning || {version:VERSION};
      const merged=mergeState(remote,readLocal(user.id));current.current=merged;setState(merged);
      if(shouldStart(user.created_at,merged)){setVisible(true);void persist({started:new Date().toISOString()});}
      else if(JSON.stringify(merged)!==JSON.stringify(remote))void persist({});
    };
    void load().catch(()=>{});
    const {data}=supabase.auth.onAuthStateChange(()=>{setTimeout(()=>{if(live)void load().catch(()=>{});},0);});
    const retry=()=>{void persist({});};window.addEventListener('online',retry);
    return()=>{live=false;data.subscription.unsubscribe();window.removeEventListener('online',retry);};
  },[]);
  function open(){if(account){setVisible(true);void persist({started:new Date().toISOString()});}}
  function finish(skipped:boolean){setVisible(false);void persist(skipped?{skipped:new Date().toISOString()}:{completed:new Date().toISOString()});}
  return <Context.Provider value={{open,dismiss:id=>{void persist({hints:{[id]:true}});},state,ready:!!account,visible}}>{children}{visible&&account&&<Onboarding role={account.role} onFinish={finish}/>}</Context.Provider>;
}
export function IntroductionLink({menu=false}:{menu?:boolean}){const c=useContext(Context);return c.ready?<button type="button" className={`tc-intro-link${menu?' tc-intro-link-menu':''}`} onClick={c.open}>{menu?<><span className="tc-intro-icon" aria-hidden="true">?</span><span><strong>Introducción a Tecni Cristal</strong><small>Volver a ver la guía inicial</small></span><b aria-hidden="true">›</b></>:<>Introducción a Tecni Cristal</>}</button>:null;}
export function ContextualHint({id}:{id:string}){const c=useContext(Context);return c.ready&&!c.visible&&!c.state.hints?.[id]?<aside className="tc-context-hint" aria-label="Ayuda"><span>{hints[id]}</span><button type="button" onClick={()=>c.dismiss(id)} aria-label="Cerrar ayuda"><span aria-hidden="true">×</span></button></aside>:null;}
