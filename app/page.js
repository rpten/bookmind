"use client";
import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";

// ─── DESIGN SYSTEM ────────────────────────────────────────────
const P = {
  bg:      "#f3efe6",
  surf:    "#ebe4d8",
  bdr:     "rgba(106,100,92,0.25)",
  text:    "#2f2a24",
  sub:     "#6a645c",
  muted:   "#9b948c",
  accent:  "#c2a878",
  accentS: "rgba(194,168,120,0.18)",
  accentM: "rgba(194,168,120,0.30)",
};
const shadow   = "0 8px 24px rgba(0,0,0,0.08)";
const shadowHv = "0 14px 36px rgba(0,0,0,0.12)";
const serif    = "Georgia, 'Times New Roman', serif";
const mono     = "'JetBrains Mono', monospace";

const EMOCAO_COR = {
  esperança:"#8e82b8", melancolia:"#5e7070", tensão:"#8a6a6a",
  reflexão:"#c2a878",  conforto:"#7a9e7e",   angústia:"#7a5a5a",
  admiração:"#6a8aaa", leveza:"#8ab88e",
};
const EMOCAO_EMOJI = {
  esperança:"✨", melancolia:"🌧", tensão:"⚡", reflexão:"🪞",
  conforto:"🕯",  leveza:"🌿",    angústia:"🌀", admiração:"🌌",
};

// ─── SHARED STYLES ────────────────────────────────────────────
const cardInput = {
  width:"100%", background:P.bg, border:`1px solid ${P.bdr}`,
  borderRadius:16, padding:"15px 18px 15px 50px",
  color:P.text, fontSize:15, fontFamily:serif, outline:"none",
};
const smallInput = {
  width:"100%", background:P.surf, border:`1px solid ${P.bdr}`,
  borderRadius:12, padding:"12px 16px", color:P.text,
  fontSize:14, fontFamily:serif, outline:"none",
};
const btnAccent = (full) => ({
  width: full ? "100%" : "auto",
  background:P.accent, color:"#fdf8f0", border:"none",
  borderRadius:14, padding:"14px 24px", cursor:"pointer",
  fontSize:15, fontFamily:serif, fontWeight:"bold",
  transition:"opacity .2s",
});
const btnOutline = {
  background:"transparent", color:P.sub,
  border:`1px solid ${P.bdr}`, borderRadius:14,
  padding:"14px 20px", cursor:"pointer",
  fontSize:14, fontFamily:serif,
};
const sectionLabel = {
  fontSize:10, color:P.muted, fontFamily:mono,
  textTransform:"uppercase", letterSpacing:".08em", marginBottom:10,
};
const chip = (active, cor) => ({
  background: active ? `${cor||P.accent}18` : "transparent",
  border: `1px solid ${active ? (cor||P.accent) : P.bdr}`,
  color: active ? (cor||P.accent) : P.sub,
  borderRadius:8, padding:"7px 14px", cursor:"pointer",
  fontSize:13, fontFamily:serif, transition:"all .15s",
});

// ─── APP ──────────────────────────────────────────────────────
export default function BookMind() {
  const [session, setSession]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [screen, setScreen]     = useState("login");
  const [books, setBooks]       = useState([]);
  const [tab, setTab]           = useState("library");
  const [selected, setSelected] = useState(null);
  const [sortBy, setSortBy]     = useState("recent");
  const [filter, setFilter]     = useState("all");
  const [notif, setNotif]       = useState(null);

  // ── Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session) { setScreen("app"); fetchBooks(session.user.id); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) { setScreen("app"); fetchBooks(session.user.id); }
      else { setScreen("login"); setBooks([]); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchBooks(userId) {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!error && data) setBooks(data.map(dbToBook));
    
  }

  // ── DB helpers
  function dbToBook(row) {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      year: row.year,
      status: row.status,
      dateRead: row.date_read,
      impact: row.impact,
      phrase: row.phrase,
      moment: row.moment,
      checkboxes: row.checkboxes || {},
      provocations: row.provocations || [],
      themes: row.themes || [],
    };
  }

  async function saveBook(book) {
    const row = {
      user_id: session.user.id,
      title: book.title,
      author: book.author,
      year: book.year,
      status: book.status,
      date_read: book.dateRead || null,
      impact: book.impact || null,
      phrase: book.phrase || null,
      moment: book.moment || null,
      checkboxes: book.checkboxes || {},
      provocations: book.provocations || [],
      themes: book.themes || [],
    };
    const { data, error } = await supabase.from("books").insert(row).select().single();
    if (!error && data) {
      setBooks(prev => [dbToBook(data), ...prev]);
      notify(`"${book.title}" adicionado`);
      setTab("library");
    }
  }

  function notify(msg) { setNotif(msg); setTimeout(() => setNotif(null), 3000); }

  if (loading) return (
    <div style={{ minHeight:"100vh", background:P.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:13, color:P.muted, fontFamily:mono }}>carregando...</div>
    </div>
  );

  if (screen === "login")      return <LoginScreen />;
  if (screen === "onboarding") return <OnboardingScreen onDone={() => setScreen("app")} />;

  const lidos = books.filter(b => b.status==="lido").length;
  const fila  = books.filter(b => b.status==="quero ler").length;

  return (
    <div style={{ minHeight:"100vh", background:P.bg, color:P.text, fontFamily:serif }}>

      {notif && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", zIndex:999, background:P.surf, border:`1px solid ${P.bdr}`, color:P.accent, padding:"10px 20px", borderRadius:50, fontSize:13, fontFamily:serif, boxShadow:shadow, whiteSpace:"nowrap" }}>{notif}</div>
      )}

      <header style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, height:54, background:"rgba(243,239,230,0.95)", backdropFilter:"blur(16px)", borderBottom:`1px solid ${P.bdr}`, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 22px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
          <div style={{ width:28, height:28, borderRadius:8, background:P.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>📚</div>
          <span style={{ fontSize:16, fontWeight:"bold", color:P.text, fontFamily:serif }}>BookMind</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:11, color:P.muted, fontFamily:mono }}>{lidos} lidos · {fila} na fila</span>
          <button onClick={() => supabase.auth.signOut()} style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:11, color:P.muted, fontFamily:mono }}>sair</button>
        </div>
      </header>

      <main style={{ paddingTop:54, paddingBottom:92 }}>
        {tab==="library"  && <LibraryTab books={books} sortBy={sortBy} setSortBy={setSortBy} filter={filter} setFilter={setFilter} onSelect={setSelected} />}
        {tab==="search"   && <SearchTab books={books} onSelect={setSelected} onAdd={saveBook} />}
        {tab==="register" && <RegisterTab onAdd={saveBook} />}
        {tab==="profile"  && <ProfileTab books={books} onSignOut={() => supabase.auth.signOut()} />}
        {tab==="chat"     && <ChatTab books={books} />}
      </main>

      <nav style={{ position:"fixed", bottom:16, left:"50%", transform:"translateX(-50%)", zIndex:100, height:58, background:P.surf, borderRadius:28, boxShadow:shadowHv, border:`1px solid ${P.bdr}`, display:"flex", padding:"0 6px", width:"calc(100% - 32px)", maxWidth:414 }}>
        {[{id:"library",l:"Biblioteca",ic:"◈"},{id:"search",l:"Pesquisar",ic:"○"},{id:"register",l:"Registrar",ic:"+"},{id:"profile",l:"Perfil",ic:"◎"},{id:"chat",l:"Conversar",ic:"✦"}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, background:tab===t.id?P.accentS:"transparent", border:"none", cursor:"pointer", borderRadius:22, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, color:tab===t.id?P.accent:P.muted, transition:"background .2s, color .2s" }}>
            <span style={{ fontSize:13 }}>{t.ic}</span>
            <span style={{ fontSize:8, fontFamily:mono, letterSpacing:".03em" }}>{t.l}</span>
          </button>
        ))}
      </nav>

      {selected && <BookModal book={selected} onClose={() => setSelected(null)} />}

      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:.2} 50%{opacity:.8} }
        * { box-sizing:border-box; margin:0; padding:0 }
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${P.bdr};border-radius:2px}
        button,input,textarea,select{font-family:inherit;outline:none}
        textarea{resize:vertical}
        input::placeholder,textarea::placeholder{color:${P.muted}}
        body{background:${P.bg}}
      `}</style>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────
function LoginScreen() {
  const [mode, setMode]       = useState("entrar");
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [nome, setNome]       = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [cardHov, setCardHov] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  function switchMode(m) { setMode(m); setAnimKey(k=>k+1); setError(null); }

  async function handleSubmit() {
    setLoading(true); setError(null);
    if (mode === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) setError("E-mail ou senha incorretos.");
    } else {
      const { error } = await supabase.auth.signUp({ email, password: pass, options: { data: { full_name: nome } } });
      if (error) setError(error.message);
      else setError("Verifique seu e-mail para confirmar o cadastro.");
    }
    setLoading(false);
  }

  async function loginWithGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo: window.location.origin } });
  }

  const icoStyle = { position:"absolute", left:17, top:"50%", transform:"translateY(-50%)", fontSize:15, color:P.muted, pointerEvents:"none" };

  return (
    <div style={{ minHeight:"100vh", background:P.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:"24px 20px", fontFamily:serif }}>
      <div
        onMouseEnter={() => setCardHov(true)}
        onMouseLeave={() => setCardHov(false)}
        style={{ width:"100%", maxWidth:420, background:P.surf, borderRadius:28, padding:"28px 28px 32px", boxShadow:cardHov?shadowHv:shadow, transform:cardHov?"scale(1.015)":"scale(1)", transition:"box-shadow .3s ease, transform .3s ease", animation:"slideUp .4s ease" }}
      >
        {/* Toggle */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
          <div style={{ background:P.bg, borderRadius:50, padding:4, display:"flex", gap:2 }}>
            {["entrar","criar"].map(m => (
              <button key={m} onClick={() => switchMode(m)} style={{ background:mode===m?P.accent:"transparent", color:mode===m?"#fdf8f0":P.muted, border:"none", borderRadius:50, padding:"8px 18px", cursor:"pointer", fontSize:14, fontFamily:serif, fontWeight:mode===m?"bold":"normal", transition:"background .25s, color .25s" }}>
                {m==="entrar" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>
        </div>

        {/* Título */}
        <div key={animKey} style={{ animation:"slideUp .3s ease", marginBottom:24 }}>
          <div style={{ fontSize:26, fontWeight:"normal", color:P.text, fontFamily:serif, lineHeight:1.2, marginBottom:6 }}>
            {mode==="entrar" ? "Entre." : "Comece."}
          </div>
          <div style={{ fontSize:14, color:P.sub, fontFamily:serif }}>Seu lugar entre histórias.</div>
        </div>

        {/* Campos */}
        <div key={`f${animKey}`} style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14, animation:"slideUp .35s ease" }}>
          {mode==="criar" && (
            <div style={{ position:"relative" }}>
              <span style={icoStyle}>◯</span>
              <input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Nome" style={cardInput} />
            </div>
          )}
          <div style={{ position:"relative" }}>
            <span style={icoStyle}>✉</span>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail" type="email" style={cardInput} />
          </div>
          <div style={{ position:"relative" }}>
            <input value={pass} onChange={e=>setPass(e.target.value)} type={showPw?"text":"password"} placeholder="Senha" style={{...cardInput, paddingLeft:18, paddingRight:50}} />
            <button onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:16, color:P.muted }}>{showPw?"○":"◎"}</button>
          </div>
        </div>

        {error && <div style={{ fontSize:13, color:"#8a4a4a", background:"rgba(138,74,74,0.08)", border:"1px solid rgba(138,74,74,0.2)", borderRadius:8, padding:"8px 12px", marginBottom:12 }}>{error}</div>}

        <button onClick={handleSubmit} disabled={loading} style={{ width:"100%", height:54, background:P.accent, color:"#fdf8f0", border:"none", borderRadius:16, fontSize:17, fontFamily:serif, fontWeight:"bold", cursor:"pointer", marginBottom:14, opacity:loading?.7:1, transition:"opacity .2s" }}>
          {loading ? "..." : mode==="entrar" ? "Entrar" : "Criar conta"}
        </button>

        {/* Divisor */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ flex:1, height:1, background:P.bdr }}/>
          <span style={{ fontSize:11, color:P.muted, fontFamily:mono }}>ou</span>
          <div style={{ flex:1, height:1, background:P.bdr }}/>
        </div>

        {/* Google */}
        <button onClick={loginWithGoogle} disabled={loading} style={{ width:"100%", height:48, background:"transparent", color:P.sub, border:`1px solid ${P.bdr}`, borderRadius:16, fontSize:14, fontFamily:serif, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, transition:"border-color .2s" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=P.accent}
          onMouseLeave={e=>e.currentTarget.style.borderColor=P.bdr}
        >
          <svg width="16" height="16" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          Continuar com Google
        </button>

        <div style={{ textAlign:"center", marginTop:18, fontSize:13, color:P.sub }}>
          {mode==="entrar"
            ? <>Não tem conta?{" "}<span onClick={()=>switchMode("criar")} style={{ color:P.text, fontWeight:"bold", cursor:"pointer", textDecoration:"underline" }}>Criar conta</span></>
            : <>Já tem conta?{" "}<span onClick={()=>switchMode("entrar")} style={{ color:P.text, fontWeight:"bold", cursor:"pointer", textDecoration:"underline" }}>Entrar</span></>
          }
        </div>
      </div>

      <style>{`
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${P.bg}}
        input::placeholder{color:${P.muted}}
      `}</style>
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────
function OnboardingScreen({ onDone }) {
  const [step, setStep]         = useState(1);
  const [query, setQuery]       = useState("");
  const [added, setAdded]       = useState([]);
  const [results, setResults]   = useState([]);
  const [emotions, setEmotions] = useState([]);

  const DEMO = [
    {id:"d1",title:"1984",author:"George Orwell"},
    {id:"d2",title:"Norwegian Wood",author:"Haruki Murakami"},
    {id:"d3",title:"O Alquimista",author:"Paulo Coelho"},
    {id:"d4",title:"Sapiens",author:"Yuval Noah Harari"},
    {id:"d5",title:"A Metamorfose",author:"Franz Kafka"},
  ];

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => setResults(DEMO.filter(b => b.title.toLowerCase().includes(query.toLowerCase()) || b.author.toLowerCase().includes(query.toLowerCase()))), 300);
    return () => clearTimeout(t);
  }, [query]);

  const profileEm = emotions[0] || "reflexão";
  const emCor = EMOCAO_COR[profileEm] || P.accent;
  const PHRASES = { esperança:"Você busca histórias que abrem janelas onde havia paredes.", melancolia:"Você busca histórias que pesam no peito e ficam na memória.", tensão:"Você busca histórias que não te deixam respirar.", reflexão:"Você busca histórias que te fazem perguntar quem você é.", conforto:"Você busca histórias que abraçam enquanto o mundo não abraça.", leveza:"Você busca histórias que lembram que o mundo ainda tem graça.", angústia:"Você busca histórias que colocam dedo na ferida.", admiração:"Você busca histórias que te lembram do quanto o mundo é vasto." };

  return (
    <div style={{ minHeight:"100vh", background:P.bg, padding:"0 22px 48px", fontFamily:serif }}>
      <div style={{ maxWidth:430, margin:"0 auto" }}>
        <div style={{ padding:"34px 0 28px" }}>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            {["Seus livros","Seu gosto","Seu perfil"].map((_,i) => <div key={i} style={{ flex:1, height:2, borderRadius:2, background:step>i+1?P.accent:step===i+1?`${P.accent}66`:P.bdr, transition:"background .4s" }}/>)}
          </div>
        </div>

        {step===1 && (
          <div style={{ animation:"slideUp .35s ease" }}>
            <h1 style={{ fontSize:22, fontWeight:"bold", color:P.text, margin:"0 0 6px" }}>Quais livros você já leu?</h1>
            <p style={{ fontSize:14, color:P.sub, margin:"0 0 24px" }}>Adicione pelo menos 3 para um perfil inicial</p>
            <div style={{ position:"relative", marginBottom:14 }}>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por título ou autor..." style={{...smallInput, paddingLeft:40}} />
            </div>
            {results.length>0 && (
              <div style={{ background:P.surf, border:`1px solid ${P.bdr}`, borderRadius:16, overflow:"hidden", marginBottom:14, boxShadow:shadow }}>
                {results.map(b => (
                  <div key={b.id} style={{ display:"flex", alignItems:"center", padding:"12px 16px", borderBottom:`1px solid ${P.bdr}`, gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:"bold", color:P.text }}>{b.title}</div>
                      <div style={{ fontSize:12, color:P.muted, fontFamily:mono, marginTop:2 }}>{b.author}</div>
                    </div>
                    <button onClick={() => { if(!added.find(a=>a.id===b.id)) setAdded(p=>[...p,b]); setQuery(""); setResults([]); }} style={{ background:P.accentS, border:`1px solid ${P.accentM}`, color:P.accent, borderRadius:8, padding:"5px 14px", cursor:"pointer", fontSize:13, fontFamily:serif }}>+</button>
                  </div>
                ))}
              </div>
            )}
            {added.length>0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:24 }}>
                {added.map(b => (
                  <div key={b.id} style={{ background:P.accentS, border:`1px solid ${P.accentM}`, borderRadius:8, padding:"5px 12px", fontSize:12, fontFamily:serif, color:P.accent, display:"flex", alignItems:"center", gap:7 }}>
                    {b.title.length>22?b.title.substring(0,22)+"…":b.title}
                    <span onClick={()=>setAdded(p=>p.filter(a=>a.id!==b.id))} style={{ cursor:"pointer", color:P.muted }}>×</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span onClick={()=>setStep(2)} style={{ fontSize:13, color:P.muted, cursor:"pointer", textDecoration:"underline" }}>Pular por agora</span>
              <button onClick={()=>setStep(2)} style={btnAccent(false)}>Continuar →</button>
            </div>
          </div>
        )}

        {step===2 && (
          <div style={{ animation:"slideUp .35s ease" }}>
            <h1 style={{ fontSize:22, fontWeight:"bold", color:P.text, margin:"0 0 6px" }}>O que você busca nos livros?</h1>
            <p style={{ fontSize:14, color:P.sub, margin:"0 0 24px" }}>Selecione quantas quiser</p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:32 }}>
              {Object.entries(EMOCAO_COR).map(([em,cor]) => {
                const sel = emotions.includes(em);
                return (
                  <button key={em} onClick={()=>setEmotions(p=>sel?p.filter(e=>e!==em):[...p,em])} style={{ height:52, borderRadius:12, cursor:"pointer", fontSize:14, background:sel?`${cor}18`:"transparent", border:`1px solid ${sel?cor:P.bdr}`, color:sel?cor:P.sub, fontFamily:serif, transition:"all .15s", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                    {EMOCAO_EMOJI[em]} {em}
                  </button>
                );
              })}
            </div>
            <button onClick={()=>setStep(3)} style={btnAccent(true)}>Continuar →</button>
          </div>
        )}

        {step===3 && (
          <div style={{ animation:"slideUp .35s ease" }}>
            <h1 style={{ fontSize:22, fontWeight:"bold", color:P.text, margin:"0 0 6px" }}>Seu perfil inicial</h1>
            <p style={{ fontSize:14, color:P.sub, margin:"0 0 24px" }}>Baseado no que você nos contou</p>
            <div style={{ background:P.surf, border:`1px solid ${P.bdr}`, borderRadius:22, padding:24, marginBottom:16, boxShadow:shadow }}>
              <div style={{ fontSize:30, fontWeight:"bold", color:emCor, marginBottom:10 }}>{profileEm}</div>
              <div style={{ fontSize:14, color:P.sub, fontStyle:"italic", lineHeight:1.75, marginBottom:18 }}>"{PHRASES[profileEm]}"</div>
              <div style={{ height:1, background:P.bdr, marginBottom:14 }}/>
              <div style={{ ...sectionLabel }}>Temas recorrentes</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {["identidade","tempo","perda","escolhas"].map(t => <span key={t} style={{ background:P.accentS, border:`1px solid ${P.accentM}`, borderRadius:6, padding:"4px 10px", fontSize:12, fontFamily:serif, color:P.accent }}>{t}</span>)}
              </div>
            </div>
            <button onClick={onDone} style={{ ...btnAccent(true), height:52 }}>Começar →</button>
          </div>
        )}
      </div>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box}`}</style>
    </div>
  );
}

// ─── BIBLIOTECA ───────────────────────────────────────────────
function LibraryTab({ books, sortBy, setSortBy, filter, setFilter, onSelect }) {
  const [view, setView] = useState("grid");

  const filtered = books
    .filter(b => filter==="all" || b.status===filter)
    .sort((a,b) => {
      if (sortBy==="recent") return (b.dateRead||"0")>(a.dateRead||"0")?1:-1;
      if (sortBy==="oldest") return (a.dateRead||"9")>(b.dateRead||"9")?1:-1;
      if (sortBy==="impact") return (b.impact||0)-(a.impact||0);
      return a.title.localeCompare(b.title);
    });

  return (
    <div style={{ padding:"24px 20px", maxWidth:430, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:"bold", margin:0, color:P.text }}>Biblioteca</h1>
          <p style={{ margin:"4px 0 0", ...sectionLabel }}>{filtered.length} livros</p>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          <button onClick={()=>setView("grid")} style={chip(view==="grid")}>Grid</button>
          <button onClick={()=>setView("queue")} style={chip(view==="queue")}>Fila</button>
        </div>
      </div>

      {view==="grid" && (
        <>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
            {[{v:"all",l:"Todos"},{v:"lido",l:"Lidos"},{v:"quero ler",l:"Fila"},{v:"abandonado",l:"Abandonados"}].map(f => (
              <button key={f.v} onClick={()=>setFilter(f.v)} style={chip(filter===f.v)}>{f.l}</button>
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:18 }}>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ background:P.surf, border:`1px solid ${P.bdr}`, color:P.sub, padding:"5px 10px", borderRadius:8, fontSize:12, fontFamily:serif, cursor:"pointer" }}>
              <option value="recent">Mais recente</option>
              <option value="oldest">Mais antigo</option>
              <option value="impact">Maior impacto</option>
              <option value="alpha">A–Z</option>
            </select>
          </div>
          {books.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0" }}>
              <div style={{ fontSize:32, marginBottom:16 }}>📖</div>
              <div style={{ fontSize:15, color:P.sub, fontFamily:serif, marginBottom:6 }}>Sua biblioteca está vazia</div>
              <div style={{ fontSize:13, color:P.muted, fontFamily:mono }}>Registre seu primeiro livro</div>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:16 }}>
              {filtered.map((book,i) => <BookCard key={book.id} book={book} index={i} onClick={()=>onSelect(book)} />)}
            </div>
          )}
        </>
      )}

      {view==="queue" && <SmartQueue books={books} onSelect={onSelect} />}
    </div>
  );
}

function BookCard({ book, index, onClick }) {
  const [hov, setHov] = useState(false);
  const ems   = [].concat(book.checkboxes?.emocao||[]);
  const emCor = EMOCAO_COR[ems[0]] || P.accent;
  return (
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ cursor:"pointer", animation:`slideUp .35s ease ${index*.06}s both`, transform:hov?"translateY(-6px) scale(1.02)":"translateY(0) scale(1)", transition:"transform .2s ease" }}>
      <div style={{ aspectRatio:"2/3", borderRadius:16, background:P.surf, border:`1px solid ${hov?P.accent:P.bdr}`, boxShadow:hov?shadowHv:shadow, transition:"border-color .2s, box-shadow .2s", position:"relative", overflow:"hidden", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
        <span style={{ fontSize:22 }}>📖</span>
        <span style={{ fontSize:8, color:P.muted, textAlign:"center", padding:"0 8px", fontFamily:mono, lineHeight:1.4 }}>{book.title.substring(0,20)}</span>
        {book.status==="quero ler" && <div style={{ position:"absolute", top:8, right:8, background:P.bg, border:`1px solid ${P.bdr}`, borderRadius:4, padding:"2px 6px", fontSize:7, color:P.muted, fontFamily:mono }}>FILA</div>}
        {book.impact && <div style={{ position:"absolute", bottom:8, left:8, display:"flex", gap:2 }}>{[1,2,3,4,5].map(i=><div key={i} style={{ width:4, height:4, borderRadius:"50%", background:i<=book.impact?emCor:P.bdr }}/>)}</div>}
      </div>
      <div style={{ marginTop:8 }}>
        <div style={{ fontSize:12, fontWeight:"bold", color:P.text, lineHeight:1.3 }}>{book.title}</div>
        <div style={{ fontSize:10, color:P.muted, marginTop:2, fontFamily:mono }}>{book.author}</div>
      </div>
    </div>
  );
}

// ─── FILA ─────────────────────────────────────────────────────
function SmartQueue({ books, onSelect }) {
  const queue = books.filter(b=>b.status==="quero ler");
  const REASONS = ["Contrasta com sua leitura recente","Alta compatibilidade emocional","Alinhado com seu momento atual","Tema recorrente no seu perfil"];
  return (
    <div style={{ animation:"slideUp .3s ease" }}>
      {queue.length===0 && <div style={{ textAlign:"center", padding:"40px 0", color:P.muted, fontFamily:mono, fontSize:12 }}>Fila vazia. Pesquise livros para adicionar.</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {queue.map((book,i) => (
          <div key={book.id} onClick={()=>onSelect(book)} style={{ background:P.surf, border:`1px solid ${P.bdr}`, borderRadius:18, padding:14, display:"flex", alignItems:"center", gap:12, cursor:"pointer", boxShadow:shadow }}>
            <div style={{ width:40, height:58, borderRadius:10, background:P.bg, border:`1px solid ${P.bdr}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📖</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:"bold", color:P.text }}>{book.title}</div>
              <div style={{ fontSize:11, color:P.muted, fontFamily:mono, marginTop:1 }}>{book.author}</div>
              <div style={{ fontSize:11, color:P.sub, fontStyle:"italic", marginTop:5 }}>{REASONS[i%REASONS.length]}</div>
            </div>
            <div style={{ width:26, height:26, borderRadius:"50%", background:i===0?P.accent:P.surf, border:`1px solid ${P.bdr}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontFamily:mono, fontWeight:"bold", color:i===0?"#fdf8f0":P.muted, flexShrink:0 }}>{i+1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PESQUISA ─────────────────────────────────────────────────
function SearchTab({ books, onSelect, onAdd }) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [sheet, setSheet]       = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Registration modal state ──────────────────────────────────
  const [regBook,    setRegBook]    = useState(null);
  const [regStatus,  setRegStatus]  = useState("lido");
  const [regImpact,  setRegImpact]  = useState(0);
  const [regEmocoes, setRegEmocoes] = useState([]);
  const [regPhrase,  setRegPhrase]  = useState("");
  const [regMoment,  setRegMoment]  = useState("");

  function openRegister(book, status = "lido") {
    setSheet(null);
    setRegBook(book);
    setRegStatus(status);
    setRegImpact(0);
    setRegEmocoes([]);
    setRegPhrase("");
    setRegMoment("");
  }

  function toggleEmo(e) {
    setRegEmocoes(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  function handleSave() {
    onAdd({
      title:    regBook.title,
      author:   regBook.author,
      year:     regBook.year,
      status:   regStatus,
      dateRead: regStatus === "lido" ? new Date().toISOString().split("T")[0] : null,
      impact:   regStatus === "lido" ? (regImpact || null) : null,
      phrase:   regPhrase  || null,
      moment:   regMoment  || null,
      checkboxes:   regEmocoes.length > 0 ? { emoção: regEmocoes } : {},
      provocations: [],
      themes:       [],
    });
    setRegBook(null);
  }

 useEffect(() => {
  console.log('ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  if (!query.trim()) { 
    setResults([]); 
    return; 
  }
  
  
  const timer = setTimeout(async () => {
    setSearchLoading(true);
    try {
      console.log('Headers sendo enviados:', {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      });
      
      const response = await fetch(
        'https://fqwugqengnenliyouojj.supabase.co/functions/v1/search-book',
        {
          method: 'POST',
          headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
},
          body: JSON.stringify({ query }),
        }
      );

      const data = await response.json();
      const formattedResults = (data.books || []).map(book => ({
        id: book.id || book.isbn,
        title: book.title,
        author: book.author,
        year: book.year?.toString() || 'N/A',
        synopsis: book.synopsis || 'Sem sinopse disponível',
        cover_url: book.cover_url,
        compat: Math.floor(Math.random() * 30) + 70,
      }));
      
      setResults(formattedResults);

      setResults(formattedResults);
    } catch (error) {
      console.error('Erro ao buscar livros:', error);
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, 400);

  return () => clearTimeout(timer);
}, [query]);

  return (
    <div style={{ padding:"24px 20px", maxWidth:430, margin:"0 auto" }}>
      <h1 style={{ fontSize:24, fontWeight:"bold", margin:"0 0 18px", color:P.text }}>Pesquisar</h1>
      <div style={{ position:"relative", marginBottom:24 }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Título, autor ou tema..." autoFocus style={{...smallInput, paddingLeft:16}} />
        {query && <button onClick={()=>{setQuery("");setResults([]);}} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:16, color:P.muted }}>×</button>}
      </div>

{searchLoading && (
  <div style={{ textAlign:"center", padding:"20px 0", color:P.muted, fontFamily:mono, fontSize:12 }}>
    buscando...
  </div>
)}

      {!query && (
        <div style={{ textAlign:"center", padding:"40px 0", color:P.muted, fontFamily:mono, fontSize:12 }}>Digite para buscar livros</div>
      )}

      {results.map((book,i) => (
        <div key={book.id} onClick={()=>setSheet(book)} style={{ display:"flex", alignItems:"center", gap:14, padding:"13px 0", borderBottom:`1px solid ${P.bdr}`, cursor:"pointer" }}>
          {book.cover_url ? (
            <img src={book.cover_url} alt={book.title} style={{ width:42, height:60, borderRadius:10, objectFit:"cover", flexShrink:0 }} />
          ) : (
            <div style={{ width:42, height:60, borderRadius:10, background:P.surf, border:`1px solid ${P.bdr}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>📖</div>
          )}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:"bold", color:P.text }}>{book.title}</div>
            <div style={{ fontSize:11, color:P.muted, fontFamily:mono, marginTop:2 }}>{book.author} · {book.year}</div>
            <span style={{ fontSize:11, color:P.accent, background:P.accentS, border:`1px solid ${P.accentM}`, borderRadius:5, padding:"2px 8px", fontFamily:mono, marginTop:5, display:"inline-block" }}>{book.compat}% compatível</span>
          </div>
        </div>
      ))}

      {sheet && (
        <div onClick={()=>setSheet(null)} style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(47,42,36,0.6)", backdropFilter:"blur(8px)", display:"flex", alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:P.bg, borderRadius:"24px 24px 0 0", padding:26, width:"100%", maxHeight:"80vh", overflowY:"auto", animation:"slideUp .3s ease" }}>
            <div style={{ width:32, height:3, background:P.bdr, borderRadius:2, margin:"0 auto 22px" }}/>
            <div style={{ fontSize:20, fontWeight:"bold", color:P.text, marginBottom:4 }}>{sheet.title}</div>
            <div style={{ fontSize:11, color:P.muted, fontFamily:mono, marginBottom:14 }}>{sheet.author} · {sheet.year}</div>
            <div style={{ fontSize:14, color:P.sub, lineHeight:1.7, marginBottom:20 }}>{sheet.synopsis}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={() => openRegister(sheet, "lido")} style={{ ...btnAccent(true), height:48 }}>Registrar leitura</button>
              <button onClick={() => openRegister(sheet, "quero ler")} style={{ ...btnOutline, width:"100%", height:48, textAlign:"center" }}>Adicionar à fila</button>
            </div>
          </div>
        </div>
      )}

      {regBook && (
        <div onClick={() => setRegBook(null)} style={{ position:"fixed", inset:0, zIndex:400, background:"rgba(47,42,36,0.65)", backdropFilter:"blur(8px)", display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:P.bg, borderRadius:"24px 24px 0 0", padding:26, width:"100%", maxHeight:"90vh", overflowY:"auto", animation:"slideUp .3s ease" }}>
            <div style={{ width:32, height:3, background:P.bdr, borderRadius:2, margin:"0 auto 20px" }}/>

            {/* Cabeçalho */}
            <div style={{ fontSize:16, fontWeight:"bold", color:P.text, marginBottom:2 }}>{regBook.title}</div>
            <div style={{ fontSize:11, color:P.muted, fontFamily:mono, marginBottom:20 }}>{regBook.author} · {regBook.year}</div>

            {/* Status */}
            <div style={sectionLabel}>status</div>
            <div style={{ display:"flex", gap:6, marginBottom:22 }}>
              {["lido","lendo","quero ler"].map(s => (
                <button key={s} onClick={() => setRegStatus(s)} style={chip(regStatus === s)}>{s}</button>
              ))}
            </div>

            {/* Impacto — só para lido */}
            {regStatus === "lido" && (
              <div style={{ marginBottom:22 }}>
                <div style={sectionLabel}>impacto pessoal</div>
                <div style={{ display:"flex", gap:6 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setRegImpact(n)} style={{ width:38, height:38, borderRadius:10, fontSize:16, cursor:"pointer", background:regImpact >= n ? P.accentS : "transparent", border:`1px solid ${regImpact >= n ? P.accent : P.bdr}`, color:regImpact >= n ? P.accent : P.muted, transition:"all .15s" }}>★</button>
                  ))}
                </div>
              </div>
            )}

            {/* Emoções */}
            <div style={{ marginBottom:22 }}>
              <div style={sectionLabel}>emoções evocadas</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {Object.entries(EMOCAO_COR).map(([em, cor]) => (
                  <button key={em} onClick={() => toggleEmo(em)} style={chip(regEmocoes.includes(em), cor)}>
                    {EMOCAO_EMOJI[em]} {em}
                  </button>
                ))}
              </div>
            </div>

            {/* Frase */}
            <div style={{ marginBottom:14 }}>
              <div style={sectionLabel}>frase que ficou</div>
              <input value={regPhrase} onChange={e => setRegPhrase(e.target.value)} placeholder="Uma imagem, sensação ou frase..." style={smallInput} />
            </div>

            {/* Momento */}
            <div style={{ marginBottom:28 }}>
              <div style={sectionLabel}>momento de vida</div>
              <input value={regMoment} onChange={e => setRegMoment(e.target.value)} placeholder="O que estava acontecendo quando você leu..." style={smallInput} />
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={handleSave} style={{ ...btnAccent(true), height:52 }}>Salvar ✓</button>
              <button onClick={() => setRegBook(null)} style={btnOutline}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REGISTRAR ────────────────────────────────────────────────
function RegisterTab({ onAdd }) {
  const [step, setStep]           = useState(1);
  const [query, setQuery]         = useState("");
  const [foundBook, setFoundBook] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [aiData, setAiData]       = useState(null);
  const [answers, setAnswers]     = useState({});
  const [provocAnswers, setProvocAnswers] = useState({});
  const [phrase, setPhrase]       = useState("");
  const [moment, setMoment]       = useState("");
  const [impact, setImpact]       = useState(0);
  const [status, setStatus]       = useState("lido");

  const DEMO=[{id:"d1",title:"Clube da Luta",author:"Chuck Palahniuk",year:"1996",synopsis:"Um homem insatisfeito forma um clube de luta secreto."},{id:"d2",title:"1984",author:"George Orwell",year:"1949",synopsis:"Em um Estado totalitário, Winston Smith questiona o controle absoluto do Partido."},{id:"d3",title:"Norwegian Wood",author:"Haruki Murakami",year:"1987",synopsis:"Uma história de amor e perda no Japão dos anos 60."},{id:"d4",title:"Sapiens",author:"Yuval Noah Harari",year:"2011",synopsis:"Uma breve história da humanidade."}];

  function handleSearch() {
    if(!query.trim()) return; setLoading(true);
    setTimeout(()=>{const q=query.toLowerCase();const found=DEMO.find(b=>b.title.toLowerCase().includes(q)||b.author.toLowerCase().includes(q))||{id:`c_${Date.now()}`,title:query,author:"Autor desconhecido",year:String(new Date().getFullYear()),synopsis:`"${query}" aguarda seus registros.`};setFoundBook(found);setLoading(false);},600);
  }

  function handleConfirm() {
    setLoading(true);
    setTimeout(()=>{setAiData({checkboxes:{ritmo:["lento","médio","envolvente","frenético"],"emoção principal":["melancolia","esperança","tensão","conforto","angústia","admiração","leveza"],narrativa:["introspectiva","social","mistério","jornada pessoal","filosófica"],personagem:["protagonista forte","elenco ensemble","anti-herói","personagem complexa"],final:["impactante","aberto","reconfortante","perturbador","previsível"]},provocations:[`O que em "${foundBook.title}" você não esperava sentir?`,"Qual personagem mais te incomodou ou fascinou?","Se pudesse conversar com o autor, qual seria sua primeira pergunta?","Esse livro mudou alguma crença que você tinha?","Qual cena ficou gravada na sua memória?"],themes:["identidade","liberdade","poder","relacionamentos","tempo"]});setStep(2);setLoading(false);},800);
  }

  function handleSave() {
    onAdd({
      title:foundBook.title, author:foundBook.author, year:foundBook.year,
      status, dateRead:status==="lido"?new Date().toISOString().split("T")[0]:null,
      impact:status==="lido"?impact:null, phrase:phrase||null, moment:moment||null,
      checkboxes:answers,
      provocations:(aiData?.provocations||[]).map((q,i)=>({q,a:provocAnswers[i]||""})).filter(p=>p.a),
      themes:aiData?.themes||[]
    });
    setStep(1); setQuery(""); setFoundBook(null); setAiData(null);
    setAnswers({}); setProvocAnswers({}); setPhrase(""); setMoment(""); setImpact(0);
  }

  function toggleAnswer(dim,opt) { setAnswers(prev=>{const cur=Array.isArray(prev[dim])?prev[dim]:[];return{...prev,[dim]:cur.includes(opt)?cur.filter(v=>v!==opt):[...cur,opt]};}); }

  const infoBox = { background:P.accentS, border:`1px solid ${P.accentM}`, borderRadius:12, padding:"10px 14px", marginBottom:22, fontSize:13, color:P.sub };

  return (
    <div style={{ padding:"24px 20px", maxWidth:560, margin:"0 auto" }}>
      <h1 style={{ fontSize:24, fontWeight:"bold", color:P.text, marginBottom:28 }}>Registrar</h1>

      <div style={{ display:"flex", gap:8, marginBottom:32 }}>
        {["Buscar","Avaliar","Refletir"].map((s,i) => (
          <div key={s} style={{ flex:1 }}>
            <div style={{ height:2, borderRadius:2, background:step>i?P.accent:step===i+1?`${P.accent}55`:P.bdr, transition:"background .3s" }}/>
            <div style={{ fontSize:9, fontFamily:mono, marginTop:6, color:step===i+1?P.accent:P.muted, textTransform:"uppercase", letterSpacing:".04em" }}>{s}</div>
          </div>
        ))}
      </div>

      {step===1 && (
        <div style={{ animation:"slideUp .3s ease" }}>
          <div style={{ display:"flex", gap:8, marginBottom:20 }}>
            <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSearch()} placeholder="Título ou autor..." style={{...smallInput,flex:1}}/>
            <button onClick={handleSearch} disabled={loading} style={{ ...btnAccent(false), opacity:loading?.6:1, minWidth:80 }}>{loading?"...":"Buscar"}</button>
          </div>
          {foundBook && (
            <div style={{ background:P.surf, border:`1px solid ${P.bdr}`, borderRadius:22, padding:22, animation:"slideUp .3s ease", boxShadow:shadow }}>
              <div style={{ fontSize:18, fontWeight:"bold", color:P.text, marginBottom:3 }}>{foundBook.title}</div>
              <div style={{ fontSize:11, color:P.muted, fontFamily:mono, marginBottom:12 }}>{foundBook.author} · {foundBook.year}</div>
              <div style={{ fontSize:14, color:P.sub, lineHeight:1.7, marginBottom:20 }}>{foundBook.synopsis}</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                {["lido","quero ler","abandonado"].map(s => <button key={s} onClick={()=>setStatus(s)} style={chip(status===s)}>{s}</button>)}
                <button onClick={handleConfirm} disabled={loading} style={{ ...btnAccent(false), marginLeft:"auto", opacity:loading?.6:1 }}>{loading?"analisando...":"Confirmar →"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step===2 && aiData && (
        <div style={{ animation:"slideUp .3s ease" }}>
          <div style={infoBox}>✦ Selecione suas dimensões para <strong style={{color:P.accent}}>{foundBook.title}</strong></div>
          {Object.entries(aiData.checkboxes).map(([dim,opts]) => {
            const cur=Array.isArray(answers[dim])?answers[dim]:[];
            return (
              <div key={dim} style={{ marginBottom:22 }}>
                <div style={sectionLabel}>{dim}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {opts.map(opt=>{const sel=cur.includes(opt);const c=EMOCAO_COR[opt]||P.accent;return<button key={opt} onClick={()=>toggleAnswer(dim,opt)} style={chip(sel,c)}>{opt}</button>;})}
                </div>
              </div>
            );
          })}
          {status==="lido" && (
            <div style={{ marginBottom:22 }}>
              <div style={sectionLabel}>impacto pessoal</div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setImpact(n)} style={{ width:38,height:38,borderRadius:10,fontSize:16,cursor:"pointer",background:impact>=n?P.accentS:"transparent",border:`1px solid ${impact>=n?P.accent:P.bdr}`,color:impact>=n?P.accent:P.muted,transition:"all .15s" }}>★</button>)}
              </div>
            </div>
          )}
          <div style={{ marginBottom:14 }}>
            <div style={sectionLabel}>frase que ficou</div>
            <input value={phrase} onChange={e=>setPhrase(e.target.value)} placeholder="Uma imagem, sensação ou frase..." style={smallInput}/>
          </div>
          <div style={{ marginBottom:28 }}>
            <div style={sectionLabel}>momento de vida</div>
            <input value={moment} onChange={e=>setMoment(e.target.value)} placeholder="O que estava acontecendo quando você leu..." style={smallInput}/>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setStep(3)} style={{ ...btnAccent(false), flex:1 }}>Próximo →</button>
            <button onClick={handleSave} style={btnOutline}>Salvar assim</button>
          </div>
        </div>
      )}

      {step===3 && aiData && (
        <div style={{ animation:"slideUp .3s ease" }}>
          <div style={infoBox}>✦ Responda o que quiser sobre <strong style={{color:P.accent}}>{foundBook.title}</strong></div>
          {aiData.provocations.map((q,i)=>(
            <div key={i} style={{ marginBottom:20 }}>
              <div style={{ fontSize:14,color:P.text,fontStyle:"italic",lineHeight:1.75,marginBottom:8 }}>"{q}"</div>
              <textarea value={provocAnswers[i]||""} onChange={e=>setProvocAnswers(p=>({...p,[i]:e.target.value}))} placeholder="Sua reflexão..." rows={3} style={{...smallInput,lineHeight:1.65}}/>
            </div>
          ))}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handleSave} style={{ ...btnAccent(false), flex:1 }}>Salvar ✓</button>
            <button onClick={()=>setStep(2)} style={btnOutline}>← Voltar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PERFIL ───────────────────────────────────────────────────
function ProfileTab({ books, onSignOut }) {
  const lidos=books.filter(b=>b.status==="lido");
  const emCont={};
  lidos.forEach(b=>{[].concat(b.checkboxes?.emocao||[]).forEach(em=>{emCont[em]=(emCont[em]||0)+1;});});
  const topEm=Object.entries(emCont).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const avgImpact=lidos.filter(b=>b.impact).length?lidos.filter(b=>b.impact).reduce((s,b)=>s+b.impact,0)/lidos.filter(b=>b.impact).length:0;
  const crd={background:P.surf,border:`1px solid ${P.bdr}`,borderRadius:18,padding:18,boxShadow:shadow};

  return (
    <div style={{ padding:"24px 20px", maxWidth:430, margin:"0 auto" }}>
      <h1 style={{ fontSize:24, fontWeight:"bold", margin:"0 0 24px", color:P.text }}>Perfil</h1>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
        {[{l:"Lidos",v:lidos.length},{l:"Impacto médio",v:avgImpact>0?`${avgImpact.toFixed(1)} ★`:"–"},{l:"Na fila",v:books.filter(b=>b.status==="quero ler").length},{l:"Abandonados",v:books.filter(b=>b.status==="abandonado").length}].map((s,i)=>(
          <div key={s.l} style={{...crd}}>
            <div style={{ fontSize:28,fontWeight:"bold",color:P.accent,marginBottom:3 }}>{s.v}</div>
            <div style={sectionLabel}>{s.l}</div>
          </div>
        ))}
      </div>

      {topEm.length>0 && (
        <div style={{...crd,marginBottom:12}}>
          <div style={sectionLabel}>Emoções que você busca</div>
          {topEm.map(([em,count])=>{const c=EMOCAO_COR[em]||P.accent;return(
            <div key={em} style={{ marginBottom:11 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                <span style={{ fontSize:13,color:c }}>{em}</span>
                <span style={{ fontSize:11,color:P.muted,fontFamily:mono }}>{count}x</span>
              </div>
              <div style={{ height:3,background:P.bdr,borderRadius:2 }}>
                <div style={{ height:"100%",borderRadius:2,background:c,width:`${(count/lidos.length)*100}%` }}/>
              </div>
            </div>
          );})}
        </div>
      )}

      {lidos.length===0 && (
        <div style={{ textAlign:"center",padding:"40px 0",color:P.muted,fontFamily:mono,fontSize:12 }}>Registre seus primeiros livros para construir seu perfil</div>
      )}

      <button onClick={onSignOut} style={{ ...btnOutline, width:"100%", marginTop:24, textAlign:"center" }}>Sair da conta</button>
    </div>
  );
}

// ─── CHAT ─────────────────────────────────────────────────────
function ChatTab({ books }) {
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const AI_CHAT_URL = 'https://fqwugqengnenliyouojj.supabase.co/functions/v1/ai-chat';

  const [msgs, setMsgs] = useState([{ role: "ai", text: "Olá. Sou sua IA literária. Posso analisar seus padrões de leitura, comparar livros, sugerir o próximo da fila ou responder qualquer pergunta sobre sua biblioteca.", recs: [] }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const QUICK = ["Que tipo de história mais mexe comigo?", "Qual livro da fila faz mais sentido agora?", "Me recomenda um livro parecido com o que mais amei"];

  async function send(text) {
    const t = (text || input).trim();
    if (!t) return;
    const newMsgs = [...msgs, { role: "user", text: t, recs: [] }];
    setMsgs(newMsgs);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(AI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: t,
          user_library: books,
          conversation_history: msgs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na resposta');
      setMsgs(prev => [...prev, { role: "ai", text: data.response, recs: data.recommendations || [] }]);
    } catch (err) {
      setMsgs(prev => [...prev, { role: "ai", text: "Desculpe, ocorreu um erro. Tente novamente.", recs: [] }]);
      console.error('ai-chat error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "24px 20px", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 140px)" }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", color: P.text, marginBottom: 18 }}>Conversar</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
        {QUICK.map(q => <button key={q} onClick={() => send(q)} style={{ background: "transparent", border: `1px solid ${P.bdr}`, color: P.muted, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: serif }}>{q}</button>)}
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
            <div style={{ maxWidth: "82%", background: m.role === "user" ? P.accentS : P.surf, border: `1px solid ${m.role === "user" ? P.accentM : P.bdr}`, borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "12px 16px", fontSize: 14, color: P.text, lineHeight: 1.75, fontFamily: serif }}>
              {m.text}
            </div>
            {m.recs?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: "90%" }}>
                {m.recs.slice(0, 3).map((r, j) => (
                  <div key={j} style={{ background: P.surf, border: `1px solid ${P.bdr}`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
                    {r.cover_url
                      ? <img src={r.cover_url} alt={r.title} style={{ width: 32, height: 46, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 32, height: 46, borderRadius: 5, background: P.bg, border: `1px solid ${P.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📖</div>
                    }
                    <div>
                      <div style={{ fontSize: 13, fontWeight: "bold", color: P.text }}>{r.title}</div>
                      <div style={{ fontSize: 11, color: P.muted, fontFamily: mono }}>{r.author}{r.avg_rating ? ` · ${r.avg_rating}★` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div style={{ display: "flex", gap: 5, padding: "8px 15px" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: P.accent, animation: `pulse 1s ${i * .2}s infinite` }} />)}</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Pergunte sobre sua biblioteca..." style={{ ...smallInput, flex: 1 }} />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{ ...btnAccent(false), opacity: (loading || !input.trim()) ? .5 : 1, minWidth: 44, padding: "12px 16px" }}>→</button>
      </div>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────
function BookModal({ book, onClose }) {
  const allTags=Object.entries(book.checkboxes||{}).flatMap(([,v])=>[].concat(v||[]));
  return(
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:200,background:"rgba(47,42,36,0.65)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:P.bg,border:`1px solid ${P.bdr}`,borderRadius:24,padding:26,maxWidth:500,width:"100%",maxHeight:"84vh",overflowY:"auto",animation:"slideUp .25s ease",boxShadow:shadowHv }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
          <div><h2 style={{ fontSize:20,fontWeight:"bold",color:P.text,margin:"0 0 4px" }}>{book.title}</h2><div style={{ fontSize:11,color:P.muted,fontFamily:mono }}>{book.author} · {book.year}</div></div>
          <button onClick={onClose} style={{ background:"transparent",border:`1px solid ${P.bdr}`,color:P.muted,width:30,height:30,borderRadius:8,cursor:"pointer",fontSize:16 }}>×</button>
        </div>
        {book.impact&&<div style={{ display:"flex",gap:3,marginBottom:16 }}>{[1,2,3,4,5].map(i=><span key={i} style={{ color:i<=book.impact?P.accent:P.bdr,fontSize:15 }}>★</span>)}</div>}
        {allTags.length>0&&<div style={{ display:"flex",flexWrap:"wrap",gap:5,marginBottom:16 }}>{allTags.map((val,i)=>{const c=EMOCAO_COR[val]||P.accent;return<div key={i} style={{ background:`${c}15`,border:`1px solid ${c}30`,borderRadius:5,padding:"3px 9px",fontSize:12,color:c }}>{val}</div>;})}</div>}
        {book.phrase&&<div style={{ borderLeft:`2px solid ${P.accent}`,paddingLeft:16,marginBottom:16,fontSize:14,color:P.sub,fontStyle:"italic",lineHeight:1.75 }}>"{book.phrase}"</div>}
        {book.moment&&<div style={{ background:P.surf,borderRadius:10,padding:"9px 14px",marginBottom:16,fontSize:12,color:P.muted }}>📍 {book.moment}</div>}
        {book.provocations?.filter(p=>p.a).map((p,i)=><div key={i} style={{ marginBottom:16 }}><div style={{ fontSize:13,color:P.accent,marginBottom:6,fontStyle:"italic" }}>"{p.q}"</div><div style={{ fontSize:14,color:P.sub,lineHeight:1.75 }}>{p.a}</div></div>)}
        {book.themes?.length>0&&<div style={{ display:"flex",flexWrap:"wrap",gap:5,marginTop:8 }}>{book.themes.map(t=><div key={t} style={{ fontSize:11,color:P.muted,background:P.surf,border:`1px solid ${P.bdr}`,borderRadius:5,padding:"3px 9px" }}>{t}</div>)}</div>}
      </div>
    </div>
  );
}