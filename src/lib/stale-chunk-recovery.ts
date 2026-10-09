/**
 * 배포 직후 「시작 화면에서 멈춤」 복구 (2026-10-09).
 *
 * 서비스 워커(`public/sw.js`)는 빠른 첫 화면을 위해 문서를 **저장본으로 먼저** 내준다(stale-while-revalidate). 배포 직후에는 그
 * 저장본이 **옛 빌드의 JS 청크**(`/_next/static/...`)를 가리키는데, 새 배포에는 그 파일이 없어 404 → React 가 붙지 않고 →
 * 시작 화면(`SplashScreen`)을 닫는 코드가 돌지 않아 아이콘 화면에 멈춘다(사파리에서 사용자 보고 — 새로고침하면 들어가짐).
 *
 * 이 스크립트는 React 보다 먼저 돌며 `/_next/static/` 스크립트 로드 실패를 잡아 **저장본을 건너뛰는 주소**(`?__fresh=…`)로 한 번
 * 다시 연다 — 서비스 워커의 저장본은 주소(검색어 포함)로 찾으므로 네트워크에서 새 문서를 받는다. 다시 열린 뒤에는 그리기 전에
 * `__fresh` 를 주소에서 지운다(라우터 · 공유 링크에 남지 않게). 10초 안에 또 실패하면 다시 열지 않는다(무한 새로고침 방지).
 *
 * 시작 화면 자체에도 CSS 안전장치가 있다(`globals.css` `splash-failsafe`) — 이 복구가 안 먹혀도 아이콘 화면에 갇히지 않는다.
 * ES5 로 쓴다(낡은 엔진에서도 실행되는 인라인 스크립트).
 */
export const FRESH_PARAM = "__fresh";

const GUARD_KEY = "foldy:stale-chunk-reload";
const GUARD_MS = 10_000;

export const STALE_CHUNK_RECOVERY_SCRIPT = `(function(){try{var P=${JSON.stringify(FRESH_PARAM)},K=${JSON.stringify(GUARD_KEY)};var u=new URL(location.href);if(u.searchParams.has(P)){u.searchParams.delete(P);history.replaceState(history.state,"",u.pathname+u.search+u.hash)}window.addEventListener("error",function(e){var t=e&&e.target;if(!t||t.tagName!=="SCRIPT")return;var s=t.src||"";if(s.indexOf("/_next/static/")<0)return;var now=Date.now(),last=0;try{last=+sessionStorage.getItem(K)||0}catch(_){}if(now-last<${GUARD_MS})return;try{sessionStorage.setItem(K,String(now))}catch(_){}var r=new URL(location.href);r.searchParams.set(P,String(now));location.replace(r.toString())},true)}catch(_){}})();`;
