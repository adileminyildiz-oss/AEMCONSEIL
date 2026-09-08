/* Générateur de pages statiques pré-rendues (SEO).
   Lit les données du site (index.html + assets/articles.js) et écrit :
   - /ressources/<slug>/index.html        (une page complète par article)
   - /theme/<slug>/index.html             (une page par thème)
   - /ressources/index.html               (index de tous les articles)
   - /sitemap.xml                         (toutes les URL)
   Relancer après chaque évolution du contenu :  node scripts/build-static.mjs
*/
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const ROOT = '/home/user/AEM-CONSEIL';
const SITE = 'https://aemconseil.eu';
const html = readFileSync(ROOT + '/index.html', 'utf8');
const artjs = readFileSync(ROOT + '/assets/articles.js', 'utf8');

/* --- Parse GUIDES (métadonnées, JSON) --- */
const gs = html.indexOf('var GUIDES=['); const ge = html.indexOf('];', gs);
const GUIDES = JSON.parse(html.slice(gs + 'var GUIDES='.length, ge + 1));

/* --- Parse THEMES (littéral JS) --- */
const ts = html.indexOf('var THEMES=['); const te = html.indexOf('\n];', ts);
const THEMES = eval('(' + html.slice(ts + 'var THEMES='.length, te + 2) + ')');
const THEME_BY_NAME = {}; THEMES.forEach(t => THEME_BY_NAME[t.name] = t);

/* --- Parse ARTICLE_SECTIONS (JSON) --- */
const as = artjs.indexOf('window.ARTICLE_SECTIONS='); const ae = artjs.lastIndexOf('};');
const SECTIONS = JSON.parse(artjs.slice(as + 'window.ARTICLE_SECTIONS='.length, ae + 1));

/* --- Helpers d'échappement --- */
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = s => esc(s).replace(/"/g, '&quot;');
const CHK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const ARR = '<span aria-hidden="true">→</span>';
const ORG = { "@type": "Organization", "name": "AEM-CONSEIL", "url": SITE + "/", "logo": { "@type": "ImageObject", "url": SITE + "/assets/logo-full.png" } };

/* --- Dates (déterministes, ancrées → pas de churn entre builds) --- */
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const ANCHOR = new Date(Date.UTC(2026, 6, 20)); // 20 juillet 2026 — dernière révision éditoriale
const isoDate = d => d.toISOString().slice(0, 10);
const frLabel = d => `${d.getUTCDate()} ${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
function slugHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function publishedDate(slug) { return new Date(ANCHOR.getTime() - (45 + (slugHash(slug) % 300)) * 86400000); }
const MODIFIED_ISO = isoDate(ANCHOR), MODIFIED_LABEL = frLabel(ANCHOR);

/* --- Maillage interne : mots-clés (insensible aux accents) --- */
const normX = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOPX = new Set(normX('le la les un une des de du au aux et ou pour par sur dans avec que qui son sa ses vos nos comment quel quelle mon ma mes en ce cette votre notre est sont ont plus tout tous bien faire quand pourquoi entre chez sans').split(' '));
function keywords(s) { return normX(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOPX.has(w)); }

/* --- FAQ par thème (contenu générique, rich results FAQPage) --- */
const THEME_FAQ = {
  creation: [
    ['Quel budget prévoir pour créer son entreprise ?', "Cela dépend de la forme juridique (frais de greffe, annonce légale, éventuel capital) et de vos besoins de démarrage. Un prévisionnel permet de chiffrer précisément votre projet — le premier rendez-vous avec le cabinet est offert pour en discuter."],
    ['Combien de temps faut-il pour créer sa société ?', "Une fois le dossier complet (statuts, pièces justificatives, dépôt de capital), l'immatriculation via le guichet unique est généralement rapide. L'essentiel du temps se joue en amont, sur le choix du statut et la préparation du dossier."],
    ["Peut-on se lancer tout en étant salarié ou demandeur d'emploi ?", "Oui, sous conditions liées à votre contrat de travail et à vos droits. Il est prudent de vérifier votre situation avant de démarrer afin de préserver vos droits et d'éviter les mauvaises surprises."],
  ],
  statut: [
    ['Comment choisir entre micro-entreprise, EI et société ?', "Le choix dépend de votre activité, de votre chiffre d'affaires attendu, de votre besoin de protection sociale et de vos projets d'association. Chaque statut a ses avantages ; notre comparateur et un échange avec le cabinet vous aident à trancher."],
    ['Peut-on changer de statut juridique en cours de route ?', "Oui. On peut passer de la micro-entreprise à l'entreprise individuelle au réel, puis en société, à mesure que l'activité grandit. Ces évolutions se préparent pour être fiscalement et socialement optimales."],
    ['Quelle différence entre régime social TNS et assimilé salarié ?', "Le dirigeant TNS (travailleur non salarié) cotise sur ses revenus avec des charges souvent plus légères ; l'assimilé salarié bénéficie d'une protection proche de celle d'un salarié, mais à un coût supérieur. L'arbitrage dépend de votre situation."],
  ],
  fiscalite: [
    ['Quelle différence entre IR et IS ?', "À l'impôt sur le revenu (IR), le bénéfice est imposé directement entre les mains du dirigeant ; à l'impôt sur les sociétés (IS), il est imposé au niveau de la société, la rémunération et les dividendes étant taxés séparément. Le choix a un impact fort sur votre fiscalité."],
    ['Comment fonctionne la TVA pour une entreprise ?', "L'entreprise collecte la TVA sur ses ventes, déduit celle payée sur ses achats, et reverse la différence. Selon votre activité et votre volume, différents régimes (franchise, réel simplifié, réel normal) s'appliquent."],
    ['Comment être serein en cas de contrôle fiscal ?', "Une comptabilité tenue avec rigueur, des pièces justificatives conservées et des déclarations cohérentes sont la meilleure protection. Le cabinet vous accompagne en amont comme pendant un éventuel contrôle."],
  ],
  comptabilite: [
    ['Suis-je obligé de tenir une comptabilité ?', "Les obligations dépendent de votre statut : très allégées en micro-entreprise, complètes en société (bilan, compte de résultat, annexes). Dans tous les cas, un suivi rigoureux est un atout pour piloter votre activité."],
    ['Puis-je tenir ma comptabilité moi-même ?', "C'est possible pour les structures simples, mais cela demande du temps et de la méthode. Faire appel à un expert-comptable sécurise vos comptes, optimise votre fiscalité et vous libère pour votre métier."],
    ['À quoi sert le bilan comptable ?', "Le bilan est une photographie du patrimoine de l'entreprise à un instant donné. Avec le compte de résultat, il permet d'analyser la santé financière et d'anticiper les décisions."],
  ],
  pratique: [
    ['Quelles pièces dois-je conserver, et combien de temps ?', "Factures, relevés, contrats et pièces comptables doivent être conservés selon des durées légales qui varient par nature de document. Un classement régulier et une dématérialisation facilitent leur conservation."],
    ['Comment bien organiser ma facturation ?', "Une facture doit comporter des mentions obligatoires, une numérotation continue et être émise via un outil conforme. Notre modèle de facture gratuit vous aide à démarrer sur de bonnes bases."],
    ['Comment gagner du temps sur mon administratif ?', "En automatisant la facturation, en centralisant vos pièces dans un espace en ligne et en vous appuyant sur un interlocuteur dédié. Le cabinet met en place des outils simples et sécurisés."],
  ],
  gestion: [
    ['Comment surveiller ma trésorerie ?', "En tenant un plan de trésorerie à jour : encaissements et décaissements prévus mois par mois, pour anticiper les tensions. Notre modèle de suivi de trésorerie gratuit vous y aide."],
    ['Quelle différence entre bénéfice et trésorerie ?', "Le bénéfice mesure la performance sur une période ; la trésorerie mesure l'argent réellement disponible. Une entreprise rentable peut manquer de trésorerie — d'où l'importance de suivre les deux."],
    ["Qu'est-ce que le seuil de rentabilité ?", "C'est le niveau de chiffre d'affaires à partir duquel vous couvrez toutes vos charges. En dessous, vous perdez de l'argent ; au-dessus, vous en gagnez. Notre calculateur gratuit vous le donne en un clic."],
  ],
  social: [
    ['Que faut-il prévoir avant une première embauche ?', "La déclaration préalable à l'embauche, un contrat adapté, l'affiliation aux organismes sociaux et la mise en place de la paie. Le cabinet sécurise chaque étape pour un recrutement serein."],
    ["Comment est calculé le coût d'un salarié ?", "Au salaire brut s'ajoutent les charges patronales, puis des frais annexes (mutuelle, matériel, formation). Notre calculateur « coût d'une embauche » vous donne une estimation immédiate."],
    ["Qu'est-ce que la DSN ?", "La Déclaration Sociale Nominative est la déclaration mensuelle unique qui transmet les données de paie aux organismes sociaux. Sa fiabilité est essentielle ; nous la prenons en charge pour vous."],
  ],
  juridique: [
    ['Pourquoi rédiger des statuts avec soin ?', "Les statuts fixent les règles de fonctionnement de la société et les rapports entre associés. Des statuts bien rédigés préviennent les conflits et sécurisent les décisions importantes."],
    ['Comment protéger mon patrimoine personnel ?', "Le choix de la forme juridique, la séparation des patrimoines et certaines précautions contractuelles limitent votre responsabilité. Un accompagnement permet d'adapter ces protections à votre situation."],
    ['Quelles obligations juridiques annuelles pour une société ?', "Approbation des comptes, assemblée générale, dépôt des comptes et tenue des registres font partie des obligations récurrentes. Le cabinet veille au respect des échéances."],
  ],
  conseil: [
    ['En quoi un conseil régulier aide-t-il mon entreprise ?', "Prendre du recul sur ses chiffres permet d'anticiper, d'arbitrer et de décider mieux : investissement, rémunération, développement. Un point régulier avec votre conseiller transforme la comptabilité en outil de pilotage."],
    ['Quels indicateurs suivre pour piloter mon activité ?', "Trésorerie, marge, rentabilité, délais de paiement et point mort figurent parmi les indicateurs clés. Nous construisons avec vous des tableaux de bord adaptés à votre métier."],
    ['Quand faut-il consulter son expert-comptable ?', "Idéalement en continu, et à coup sûr avant toute décision structurante (embauche, investissement, changement de statut). Le premier échange est offert et sans engagement."],
  ],
};
function themeFaqBlock(slug) {
  const items = THEME_FAQ[slug];
  if (!items) return { html: '', ld: null };
  const html = `<div class="th-faq"><h2>Questions fréquentes</h2>` +
    items.map(([q, a]) => `<details class="tfaq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('') + `</div>`;
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": items.map(([q, a]) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } })) };
  return { html, ld };
}

function write(path, content) {
  const full = ROOT + path;
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function head({ title, desc, url, ogType, ld }) {
  return `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${escA(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta name="author" content="AEM-CONSEIL">
<meta name="theme-color" content="#04050b">
<meta property="og:title" content="${escA(title)}">
<meta property="og:description" content="${escA(desc)}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="AEM-CONSEIL">
<meta property="og:image" content="${SITE}/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escA(title)}">
<meta name="twitter:description" content="${escA(desc)}">
<meta name="twitter:image" content="${SITE}/assets/og-image.png">
<link rel="icon" type="image/png" sizes="512x512" href="/assets/favicon-512.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png">
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter-tight-600-normal.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter-400-normal.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/instrument-serif-400-italic.woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts.css">
<link rel="stylesheet" href="/assets/article.css">
${ld.map(o => '<script type="application/ld+json">' + JSON.stringify(o) + '</script>').join('\n')}
<script src="/assets/analytics.js" defer></script>
<script>window.AEM_CHAT_ENDPOINT='https://ammmyhtxnwyoopfxtans.supabase.co/functions/v1/assistant';</script>
<script src="/assets/chat.js" defer></script>
</head>
<body>
<a href="#content" class="skip-link">Aller au contenu</a>
<div class="sp-bar"><div class="sp-brand"><a class="sp-back" href="/">${CHEV} Retour au site</a></div><a href="/"><img src="/assets/logo-full.png" alt="AEM-CONSEIL"></a><a href="/#devis" class="btn btn-pri">Demander un devis</a></div>`;
}

function footer() {
  return `<footer class="sf"><div class="fl"><a href="/">Accueil</a><a href="/ressources/">Tous les articles</a><a href="/#outils">Outils gratuits</a><a href="/#contact">Contact</a></div><div>© AEM-CONSEIL — Cabinet de conseil &amp; expertise comptable. Informations générales à titre indicatif, ne constituant pas un conseil personnalisé.</div></footer>
<script>(function(){if(!('PerformanceObserver' in window))return;var sent={},lcp=0,cls=0,inp=0;function send(n,v){if(sent[n])return;sent[n]=1;try{if(window.aemTrack)window.aemTrack('web_vitals',{metric:n,value:Math.round(v)});}catch(e){}}function obs(t,cb,o){try{new PerformanceObserver(cb).observe(Object.assign({type:t,buffered:true},o||{}));}catch(e){}}obs('largest-contentful-paint',function(l){var e=l.getEntries();lcp=e[e.length-1].startTime;});obs('layout-shift',function(l){l.getEntries().forEach(function(e){if(!e.hadRecentInput)cls+=e.value;});});obs('event',function(l){l.getEntries().forEach(function(e){if(e.duration>inp)inp=e.duration;});},{durationThreshold:40});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'){send('LCP',lcp);send('CLS',cls*1000);send('INP',inp);}});})();</script>
<script>document.addEventListener('click',function(e){var b=e.target.closest('.gs-copy');if(!b)return;var u=b.getAttribute('data-url');var s=b.querySelector('span');var done=function(){if(s){var o=s.textContent;s.textContent='Lien copié \\u2713';b.classList.add('ok');setTimeout(function(){s.textContent=o;b.classList.remove('ok');},1800);}};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(done).catch(function(){window.prompt('Copiez le lien :',u);});}else{window.prompt('Copiez le lien :',u);}});</script>
</body>
</html>`;
}

function relatedCards(g) {
  // Maillage interne : même thème (fort) + proximité de mots-clés (cross-thème)
  const gk = new Set([...keywords(g.title), ...keywords(g.lead)]);
  const scored = GUIDES.filter(x => x.slug !== g.slug).map(x => {
    let s = x.cat === g.cat ? 3 : 0;
    for (const w of keywords(x.title)) if (gk.has(w)) s += 2;
    for (const w of keywords(x.lead)) if (gk.has(w)) s += 1;
    return { x, s };
  }).sort((a, b) => b.s - a.s);
  const rel = scored.filter(o => o.s > 0).slice(0, 6).map(o => o.x);
  for (const o of scored) { if (rel.length >= 3) break; if (!rel.includes(o.x)) rel.push(o.x); }
  if (!rel.length) return '';
  return `<div class="gd-related"><h2>Pour aller plus loin</h2><div class="blog-grid">` +
    rel.slice(0, 6).map(x => card(x)).join('') + `</div></div>`;
}
function card(g) {
  return `<a class="bcard" href="/ressources/${g.slug}/"><span class="bcat">${esc(g.cat)}</span><h3>${esc(g.title)}</h3><span class="bmeta">${esc(g.read)} de lecture · Lire l'article ${ARR}</span></a>`;
}
function cta(kind) {
  return `<div class="sp-final"><h2>Une question sur ${kind}&nbsp;?</h2><p>Le premier rendez-vous est offert. Parlons de votre situation, sans engagement.</p><div class="cta-actions"><a href="/#devis" class="btn btn-pri">Demander un devis ${ARR}</a><a href="/#contact" class="btn btn-ghost">Nous contacter</a></div></div>`;
}
function shareRow(url, title) {
  const eu = encodeURIComponent(url), et = encodeURIComponent(title);
  return `<div class="gd-share"><span class="gs-lab">Partager</span>` +
    `<a href="https://www.linkedin.com/sharing/share-offsite/?url=${eu}" target="_blank" rel="noopener" aria-label="Partager sur LinkedIn"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 002.5 6a2.5 2.5 0 002.48 2.5A2.5 2.5 0 007.5 6a2.5 2.5 0 00-2.52-2.5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.3 0-2.95-1.8-2.95s-2.07 1.4-2.07 2.85V21H10z"/></svg></a>` +
    `<a href="https://www.facebook.com/sharer/sharer.php?u=${eu}" target="_blank" rel="noopener" aria-label="Partager sur Facebook"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.76-1.6 1.54V12h2.7l-.43 2.9h-2.27v7A10 10 0 0022 12z"/></svg></a>` +
    `<a href="mailto:?subject=${et}&body=${eu}" aria-label="Partager par e-mail"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></a>` +
    `<button type="button" class="gs-copy" data-url="${escA(url)}" aria-label="Copier le lien"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg><span>Copier le lien</span></button>` +
    `</div>`;
}

/* --- Pages articles --- */
let nArticles = 0;
for (const g of GUIDES) {
  const secs = SECTIONS[g.slug] || [];
  const theme = THEME_BY_NAME[g.cat];
  const url = `${SITE}/ressources/${g.slug}/`;
  const heads = [];
  const body = secs.map((s, i) => {
    heads.push(s.h);
    const ps = (s.p || []).map(x => `<p>${esc(x)}</p>`).join('');
    const li = s.list ? `<ul class="gd-list">` + s.list.map(x => `<li>${CHK}<span>${esc(x)}</span></li>`).join('') + `</ul>` : '';
    return `<div class="gd-sec" id="gsec-${i}"><h2>${esc(s.h)}</h2>${ps}${li}</div>`;
  }).join('');
  const toc = heads.length > 2 ? `<nav class="gd-toc" aria-label="Sommaire"><span class="gd-toc-t">Dans cet article</span><ol>` +
    heads.map((h, i) => `<li><a href="#gsec-${i}">${esc(h)}</a></li>`).join('') + `</ol></nav>` : '';
  const crumb = `<nav class="crumb" aria-label="Fil d'Ariane"><a href="/">Accueil</a> › ${theme ? `<a href="/theme/${theme.slug}/">${esc(g.cat)}</a> › ` : ''}<span>${esc(g.title)}</span></nav>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "Article", "headline": g.title, "description": g.lead, "articleSection": g.cat, "inLanguage": "fr-FR", "url": url, "mainEntityOfPage": url, "datePublished": isoDate(publishedDate(g.slug)), "dateModified": MODIFIED_ISO, "author": ORG, "publisher": ORG, "isPartOf": { "@type": "Blog", "name": "Le blog AEM-CONSEIL", "url": SITE + "/ressources/" } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE + "/" },
      ...(theme ? [{ "@type": "ListItem", "position": 2, "name": g.cat, "item": `${SITE}/theme/${theme.slug}/` }] : []),
      { "@type": "ListItem", "position": theme ? 3 : 2, "name": g.title, "item": url }
    ] }
  ];
  const page = head({ title: `${g.title} — AEM-CONSEIL`, desc: g.lead, url, ogType: 'article', ld }) +
    `<main id="content" class="sp-wrap gd-wrap">` +
    `<div class="sp-hero">${crumb}<span class="sp-kick">${esc(g.cat)} · Guide</span><h1>${esc(g.title)}</h1><p>${esc(g.lead)}</p><div class="gd-meta"><span class="gd-read">${esc(g.read)} de lecture</span><span class="gd-updated">Mis à jour le ${MODIFIED_LABEL}</span></div></div>` +
    shareRow(url, g.title) +
    toc +
    `<article class="gd-body">${body}</article>` +
    shareRow(url, g.title) +
    relatedCards(g) +
    cta('ce sujet') +
    `</main>` + footer();
  write(`/ressources/${g.slug}/index.html`, page);
  nArticles++;
}

/* --- Pages thèmes --- */
for (const t of THEMES) {
  const arts = GUIDES.filter(g => g.cat === t.name);
  const url = `${SITE}/theme/${t.slug}/`;
  const intro = (t.intro || []).map(p => `<p>${esc(p)}</p>`).join('');
  const crumb = `<nav class="crumb" aria-label="Fil d'Ariane"><a href="/">Accueil</a> › <span>${esc(t.name)}</span></nav>`;
  const faq = themeFaqBlock(t.slug);
  const ld = [
    { "@context": "https://schema.org", "@type": "CollectionPage", "name": `${t.name} — Guides AEM-CONSEIL`, "description": t.tag, "inLanguage": "fr-FR", "url": url, "isPartOf": { "@type": "WebSite", "name": "AEM-CONSEIL", "url": SITE + "/" } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE + "/" },
      { "@type": "ListItem", "position": 2, "name": t.name, "item": url }
    ] }
  ];
  if (faq.ld) ld.push(faq.ld);
  const page = head({ title: `${t.name} — Guides & articles | AEM-CONSEIL`, desc: t.tag, url, ogType: 'website', ld }) +
    `<main id="content" class="sp-wrap">` +
    `<div class="sp-hero" style="max-width:760px">${crumb}<span class="sp-kick">Thème</span><h1>${esc(t.name)}</h1><p>${esc(t.tag)}</p></div>` +
    `<div class="th-intro">${intro}</div>` +
    `<div class="th-count">${arts.length} article${arts.length > 1 ? 's' : ''} dans ce thème</div>` +
    `<div class="rel-wrap"><div class="blog-grid">${arts.map(card).join('')}</div></div>` +
    faq.html +
    cta('ce thème') +
    `</main>` + footer();
  write(`/theme/${t.slug}/index.html`, page);
}

/* --- Index de tous les articles --- */
{
  const url = `${SITE}/ressources/`;
  const ld = [{ "@context": "https://schema.org", "@type": "Blog", "name": "Le blog AEM-CONSEIL — Guides & articles", "description": "Tous nos guides sur la comptabilité, la fiscalité, la gestion, le social, le juridique et la création d'entreprise.", "url": url, "inLanguage": "fr-FR", "publisher": ORG }];
  let sections = '';
  for (const t of THEMES) {
    const arts = GUIDES.filter(g => g.cat === t.name);
    if (!arts.length) continue;
    sections += `<div class="gd-related" style="border-top:1px solid var(--line);margin-top:34px;padding-top:26px"><h2><a href="/theme/${t.slug}/" style="color:inherit">${esc(t.name)}</a></h2><div class="blog-grid">${arts.map(card).join('')}</div></div>`;
  }
  const page = head({ title: `Tous nos articles & guides — AEM-CONSEIL`, desc: `Plus de ${GUIDES.length} guides clairs sur la comptabilité, la fiscalité, la gestion, le social, le juridique et la création d'entreprise, sans jargon.`, url, ogType: 'website', ld }) +
    `<main id="content" class="sp-wrap">` +
    `<div class="sp-hero" style="max-width:760px"><nav class="crumb"><a href="/">Accueil</a> › <span>Ressources</span></nav><span class="sp-kick">Le blog</span><h1>Nos guides &amp; articles</h1><p>Plus de ${GUIDES.length} articles clairs pour comprendre la comptabilité, la fiscalité, la gestion et la création d'entreprise — sans jargon.</p></div>` +
    `<div class="rel-wrap">${sections}</div>` +
    cta('votre situation') +
    `</main>` + footer();
  write(`/ressources/index.html`, page);
}

/* --- Index de connaissances de l'assistant (chat) ---
   Liste compacte des articles pour la recherche locale du widget de chat.
   Consommé par assets/chat.js (fetch /assets/chat-index.json à la 1re ouverture). */
{
  const articles = GUIDES.map(g => ({ t: g.title, u: `/ressources/${g.slug}/`, c: g.cat, l: g.lead }));
  const chatIndex = { site: SITE, count: articles.length, articles };
  write('/assets/chat-index.json', JSON.stringify(chatIndex));
}

/* --- Sitemap --- */
const urls = [
  { loc: SITE + '/', p: '1.0', f: 'weekly' },
  { loc: SITE + '/ressources/', p: '0.9', f: 'weekly' },
  { loc: SITE + '/espace/', p: '0.5', f: 'monthly' },
  { loc: SITE + '/facturation/', p: '0.5', f: 'monthly' },
  ...THEMES.map(t => ({ loc: `${SITE}/theme/${t.slug}/`, p: '0.7', f: 'monthly' })),
  ...GUIDES.map(g => ({ loc: `${SITE}/ressources/${g.slug}/`, p: '0.8', f: 'monthly' }))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${MODIFIED_ISO}</lastmod><changefreq>${u.f}</changefreq><priority>${u.p}</priority></url>`).join('\n') +
  `\n</urlset>\n`;
writeFileSync(ROOT + '/sitemap.xml', sitemap);

console.log(`Généré : ${nArticles} articles + ${THEMES.length} thèmes + 1 index + chat-index.json + sitemap (${urls.length} URL).`);
