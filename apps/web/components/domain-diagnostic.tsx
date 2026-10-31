'use client';
import {useState} from 'react';
import {api,type Row} from '../lib/api';
export function DomainDiagnostic({id}:{id:string}){
 const [data,setData]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="section-gap"><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setData(await api(`/domains/${id}/diagnostics`));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Checking DNS…':'Check authentication records'}</button>{error&&<p className="form-error" role="alert">{error}</p>}{data&&<><dl className="detail-grid">{['ownership','spf','dkim','dmarc'].map(k=><div key={k}><dt>{k.toUpperCase()}</dt><dd>{String(data[k].status).replaceAll('_',' ')}</dd></div>)}</dl><p className="small subtle">{data.note}</p></>}</div>;
}
