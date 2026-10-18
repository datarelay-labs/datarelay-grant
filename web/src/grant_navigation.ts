/** Grant-owned SPA navigation with one bounded dirty-editor interception point. */
export type GrantNavigationIntent={
  next:string;
  kind:'push'|'pop';
  proceed:()=>void;
  cancel:()=>void;
};
export type GrantNavigationBlocker=(intent:GrantNavigationIntent)=>boolean;
export type GrantNavigation={navigate:(next:string)=>void;dispose:()=>void};

let activeBlocker:GrantNavigationBlocker|null=null;
export function registerGrantNavigationBlocker(blocker:GrantNavigationBlocker):()=>void{
  activeBlocker=blocker;
  return()=>{if(activeBlocker===blocker)activeBlocker=null;};
}

const indexKey='__grant_navigation_index__';
function safePath(next:string):boolean{return next.startsWith('/')&&!next.startsWith('//');}
export function createGrantNavigation(win:Window,setPath:(path:string)=>void):GrantNavigation{
  const history=win.history;
  const initial=history.state?.[indexKey];
  let current=Number.isInteger(initial)?Number(initial):0;
  if(!Number.isInteger(initial))history.replaceState({...history.state,[indexKey]:current},'',win.location.href);
  let restoring=false;
  let queuedProceed:(()=>void)|null=null;
  let allowedPop:number|null=null;

  const commitPush=(next:string)=>{
    current+=1;
    history.pushState({...history.state,[indexKey]:current},'',next);
    setPath(next);
  };
  const request=(intent:GrantNavigationIntent,commit:()=>void)=>{
    if(activeBlocker?.(intent))return;
    commit();
  };
  const onPop=(event:PopStateEvent)=>{
    const target=event.state?.[indexKey];
    const next=win.location.pathname;
    if(!Number.isInteger(target)){
      current=0;history.replaceState({...history.state,[indexKey]:current},'',win.location.href);setPath(next);return;
    }
    if(allowedPop===target){allowedPop=null;current=target;setPath(next);return;}
    if(restoring){
      restoring=false;
      const proceed=queuedProceed;queuedProceed=null;
      if(proceed)queueMicrotask(proceed);
      return;
    }
    const delta=target-current;
    if(delta===0){setPath(next);return;}
    const proceed=()=>{
      const run=()=>{allowedPop=target;history.go(delta);};
      if(restoring)queuedProceed=run;else run();
    };
    const intent:GrantNavigationIntent={next,kind:'pop',proceed,cancel:()=>{}};
    if(activeBlocker?.(intent)){
      restoring=true;
      history.go(-delta);
      return;
    }
    current=target;setPath(next);
  };
  win.addEventListener('popstate',onPop);
  return {
    navigate:(next:string)=>{
      if(!safePath(next)||next===win.location.pathname)return;
      const intent:GrantNavigationIntent={next,kind:'push',proceed:()=>commitPush(next),cancel:()=>{}};
      request(intent,()=>commitPush(next));
    },
    dispose:()=>{win.removeEventListener('popstate',onPop);},
  };
}
