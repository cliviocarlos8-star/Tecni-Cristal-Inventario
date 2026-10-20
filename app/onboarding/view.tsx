"use client";
import {useEffect,useRef,useState} from 'react';
import {TcIcon,type IconName} from '../icons';
import {canOperate,steps,type Role} from './model';
function Tile({icon,title,text}:{icon:IconName;title:string;text?:string}){return <div className="tc-learn-tile"><TcIcon name={icon} size={30}/><strong>{title}</strong>{text&&<span>{text}</span>}</div>;}
function Visual({step,write}:{step:number;write:boolean}){
  if(step===0)return <div className="tc-learn-grid three"><Tile icon="products" title="Inventario" text="Qué tenemos"/><Tile icon="works" title="Obras" text="Dónde se utiliza"/><Tile icon="active-products" title="Catálogo" text="Qué producto es"/></div>;
  if(step===1)return <div className="tc-location-model"><Tile icon="products" title="Material"/><p>Puede encontrarse en</p><div className="tc-learn-grid"><Tile icon="warehouse" title="Depósito" text="Stock del depósito"/><Tile icon="works" title="Cada obra" text="Stock de esa obra"/></div></div>;
  if(step===2)return <div className="tc-learn-grid three">{(write? [['plus','Entrada'],['arrow-right','Salida'],['movements','Transferencia'],['suppliers','Compra'],['movements','Devolución'],['count','Ajuste']]:[['movements','Movimientos'],['products','Existencias'],['works','Ubicaciones']]).map(([icon,title])=><Tile key={title} icon={icon as IconName} title={title}/>)}</div>;
  if(step===3)return <div className="tc-learn-grid"><Tile icon="search" title="Catálogo Técnico" text="¿Qué producto es? Imágenes y características."/><Tile icon="warehouse" title="Inventario" text="¿Cuánto tenemos y dónde está? Existencias actuales."/></div>;
  return <div className="tc-learn-grid"><Tile icon="movements" title="Movimientos" text="Qué se movió"/><Tile icon="reports" title="Historial" text="Qué ocurrió"/><Tile icon="alert" title="Alertas" text="Qué requiere atención"/><Tile icon="home" title="Actividad reciente" text="Las últimas operaciones"/></div>;
}
export default function Onboarding({role,onFinish}:{role:Role;onFinish:(skipped:boolean)=>void}){
 const [step,setStep]=useState(0);const dialog=useRef<HTMLDialogElement>(null);const heading=useRef<HTMLHeadingElement>(null);const write=canOperate(role);const done=step===5;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const el=dialog.current;el?.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
 useEffect(()=>{heading.current?.focus();},[step]);
 function go(destination:string){onFinish(false);if(destination==='catalog'){window.location.assign('/catalogo-tecnico');return;}if(window.location.pathname!=='/'){window.location.assign(`/?start=${destination}`);return;}window.dispatchEvent(new CustomEvent('tc-learning-navigate',{detail:destination}));}
 const item=steps[Math.min(step,4)];
 return <dialog ref={dialog} className="tc-onboarding" aria-labelledby="tc-learn-title" onCancel={e=>{e.preventDefault();onFinish(true);}}>
  <header className="tc-learn-header"><span><img src="/brand/tecni-cristal-logo.jpg" alt=""/>Tecni Cristal <small>Introducción</small></span><button type="button" aria-label="Cerrar y saltar introducción" onClick={()=>onFinish(true)}><TcIcon name="close"/></button></header>
  <div className="tc-learn-body" key={step}>
   <div className="tc-learn-copy"><span className="tc-learn-kicker">{done?'TU PUNTO DE PARTIDA':`LO ESENCIAL · ${step+1} DE 5`}</span><h2 id="tc-learn-title" ref={heading} tabIndex={-1}>{done?'Todo listo':step===2&&!write?'Consulta las operaciones':item.title}</h2><p>{done?'Ya conoces lo esencial. No necesitas aprender todo desde el primer día: empieza con una acción y explora cada módulo cuando lo necesites.':step===2&&!write?'Tu acceso de consulta permite revisar los movimientos y las existencias. Las operaciones las registran los usuarios autorizados.':item.text}</p></div>
   {done?<div className="tc-learn-start"><button onClick={()=>go('catalog')}><TcIcon name="search"/><span>Buscar material<small>Identificar en el Catálogo Técnico</small></span><TcIcon name="arrow-right"/></button>{write&&<button onClick={()=>go('movements')}><TcIcon name="movements"/><span>Registrar movimiento<small>Abrir el módulo de operaciones</small></span><TcIcon name="arrow-right"/></button>}<button onClick={()=>go('works')}><TcIcon name="works"/><span>Consultar una obra<small>Ver sus materiales y existencias</small></span><TcIcon name="arrow-right"/></button></div>:<div className="tc-learn-visual"><Visual step={step} write={write}/></div>}
   {!done&&<p className="tc-learn-note">{step===2&&!write?'Puedes consultar la información sin modificar el inventario.':item.note}</p>}
  </div>
  <footer className="tc-learn-footer"><div className="tc-learn-progress" aria-label={done?'Introducción completa':`Paso ${step+1} de 5`}>{steps.map((_,i)=><span key={i} className={i<=step?'active':''} aria-hidden="true"/>)}<small>{done?'Listo':`${step+1} / 5`}</small></div><div className="tc-learn-actions">{step>0&&<button onClick={()=>setStep(step-1)}>Anterior</button>}<button className="tc-learn-primary" onClick={()=>done?go('home'):setStep(step+1)}>{done?'Ir al inicio':step===4?'Elegir dónde empezar':'Siguiente'}<TcIcon name="arrow-right" size={18}/></button></div><button className="tc-learn-skip" onClick={()=>onFinish(true)}>Saltar introducción</button></footer>
 </dialog>;
}
