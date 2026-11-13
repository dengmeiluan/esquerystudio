function a(r,s){const t=r.replace(/\/+$/,""),n=s||"";return t+(n.startsWith("/")||n.startsWith("?")?n:"/"+n)}function c(r,s,t,n="http://localhost:9200"){let o=`curl -X${r.toUpperCase()} "${a(n,s)}"`;if(t&&t.trim()){const i=t.trim().replace(/[\\"$`]/g,p=>"\\"+p);o+=` -H "Content-Type: application/json" -d "${i}"`}return o}function u(r,s,t,n="http://localhost:9200"){const e=r.toUpperCase(),o=t&&t.trim();return`const resp = await fetch("${a(n,s)}", {
  method: "${e}",${o?`
  headers: { "Content-Type": "application/json" },
  body: ${JSON.stringify(t.trim())},`:""}
});
const data = await resp.json();
console.log(data);`}function l(r,s,t,n="http://localhost:9200"){const e=r.toUpperCase(),o=t&&t.trim();return`import requests

resp = requests.request(
    "${e}",
    "${a(n,s)}",${o?`
    headers={"Content-Type": "application/json"},
    data=${$(t.trim())},`:""}
)
print(resp.json())`}function $(r){return JSON.stringify(r)}function f(r,s,t,n,e){return r==="js"?u(s,t,n,e):r==="python"?l(s,t,n,e):c(s,t,n,e)}export{u as a,c as b,f as g,l as t};
