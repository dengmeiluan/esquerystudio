function e(r){const t=r.match(/[\\/?"<>|,#]/);return t?'目标索引名含非法字符 "'+t[0]+'"（ES 索引名不允许 \\ / ? " < > | , #）':/[A-Z]/.test(r)?"目标索引名含大写字母（ES 索引名必须小写）":""}export{e as i};
