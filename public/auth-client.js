document.querySelector('#login-form').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
 const error=document.querySelector('#login-error');error.textContent='';
 try{
  const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
  const result=await response.json();if(!response.ok)throw new Error(result.error);
  e.target.reset();location.replace('/');
 }catch(e){error.textContent=e.message||'Nie udało się zalogować.';}finally{button.disabled=false;}
});
