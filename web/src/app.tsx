import { useEffect, useState } from 'react';
import { AuthLayout, LoginForm, MfaChallengeForm, ProductShell, ThemeRoot, Button, Card } from '@datarelay-labs/foundation';
import { ApiError, setCsrf } from './api';
import { authAdapter, productConfig, readSession } from './foundation.config';
import { useTask } from './common';
import { RequestList, RequestDetail, NewRequest } from './requests';
import { EmailTemplates, Integrations, Profiles } from './integrations';
import { Administration, Security } from './administration';
import type { Session } from './types';

export function App(){
 const [session,setSession]=useState<Session|null>(null);const [loading,setLoading]=useState(true);const [path,setPath]=useState(location.pathname==='/'?'/requests':location.pathname);const [theme,setTheme]=useState<'light'|'dark'>('light');const task=useTask();
 const signedOut=()=>{setCsrf('');setSession(null);};
 async function refresh(){try{setSession(await readSession());}catch(e){if(e instanceof ApiError&&e.status===401)signedOut();else throw e;}}
 useEffect(()=>{void task.run(async()=>{await refresh();setLoading(false);});const pop=()=>setPath(location.pathname);window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 function navigate(next:string){if(!next.startsWith('/')||next.startsWith('//'))return;history.pushState(null,'',next);setPath(next);}
 const user=session?.user;
 if(loading)return <ThemeRoot theme={theme}><AuthLayout productName="DataRelay Grant" title="Connecting to Grant">{task.feedback}<p>Verifying your current session…</p><Button variant="secondary" onClick={()=>void task.run(async()=>{await refresh();setLoading(false);})}>Retry</Button></AuthLayout></ThemeRoot>;
 if(!user)return <ThemeRoot theme={theme}><AuthLayout productName="DataRelay Grant" productSubtitle="Human decisions. Controlled execution." description="An approval layer for DataRelay and connected systems." title={session?.state==='mfa_required'?'Verify your identity':'Sign in to Grant'} subtitle="Use your assigned Grant account. Opening an email never approves a request.">{task.feedback}{session?.state==='mfa_required'?<><MfaChallengeForm busy={task.busy} methods={['totp','recovery_code']} onSubmit={input=>task.run(async()=>{await authAdapter.verifyMfa!(input);await refresh();})}/><Button variant="ghost" onClick={()=>void task.run(async()=>{await authAdapter.signOut();signedOut();})}>Back to sign in</Button></>:<LoginForm busy={task.busy} onSubmit={input=>task.run(async()=>{await authAdapter.signIn(input);await refresh();})}/>}</AuthLayout></ThemeRoot>;
 const config=productConfig(user); const title=path.startsWith('/requests/')?(path==='/requests/new'?'New request':'Request details'):config.navigation.find(n=>n.path===path)?.label??'Not found';
 let page;
 if(path==='/requests'||path==='/approvals')page=<RequestList key={path} user={user} mine={path==='/approvals'} navigate={navigate}/>;
 else if(path==='/requests/new')page=<NewRequest navigate={navigate}/>;
 else if(/^\/requests\/[a-f0-9-]{36}\/replace$/.test(path))page=<NewRequest key={path} navigate={navigate} predecessorId={path.split('/')[2]!}/>;
 else if(/^\/requests\/[a-f0-9-]{36}$/.test(path))page=<RequestDetail key={path} id={path.split('/')[2]!} user={user} navigate={navigate}/>;
 else if(path==='/security')page=<Security user={user} onSignedOut={signedOut} onRefresh={refresh}/>;
 else if(user.role==='admin'&&path==='/integrations')page=<Integrations/>;
 else if(user.role==='admin'&&path==='/profiles')page=<Profiles/>;
 else if(user.role==='admin'&&path==='/email-templates')page=<EmailTemplates/>;
 else if(user.role==='admin'&&path==='/system')page=<Administration/>;
 else page=<Card title="Page unavailable"><p>This page does not exist or is not available to your account.</p></Card>;
 return <ThemeRoot theme={theme}><ProductShell product={config.product} navigation={config.navigation} capabilities={config.capabilities} currentPath={path} onNavigate={navigate} pageTitle={title} pageSubtitle="Approval does not equal delivery or execution." principal={{displayName:user.username,detail:user.email}} headerActions={<Button variant="secondary" onClick={()=>setTheme(theme==='light'?'dark':'light')}>Use {theme==='light'?'dark':'light'} theme</Button>} userActions={<Button variant="ghost" disabled={task.busy} onClick={()=>void task.run(async()=>{try{await authAdapter.signOut();}catch(e){if(!(e instanceof ApiError&&e.status===401))throw e;}signedOut();})}>Sign out</Button>}>{task.feedback}{page}</ProductShell></ThemeRoot>;
}
