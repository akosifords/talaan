import {useEffect,useState} from 'react';
export default function useRoute(scope, fallback){
 const read=()=>{const parts=location.hash.slice(1).split('/');return scope==='page'?(parts[0]||fallback):(parts[0]===scope&&parts[1]||fallback);};
 const [value,update]=useState(read);
 useEffect(()=>{const sync=()=>update(read());window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
 return [value,next=>{location.hash=scope==='page'?next:`${scope}/${next}`;update(next);}];
}
