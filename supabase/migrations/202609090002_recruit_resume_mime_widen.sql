-- recruit-resumes 버킷의 허용 형식 확대 (2026-09-09) — 백필에서 실제로 거부된 형식들.
--
-- 194건 백필에서 이력서 89건 중 4건이 업로드 거부됐다. 형식 때문이었다:
--   application/haansofthwp   (.hwp  — 한글)
--   application/haansoftxlsx  (.xlsx — 한글 오피스가 붙이는 MIME)
--   image/heic                (.heic — 아이폰이 기본으로 찍는 사진)
--
-- 처음 목록(pdf/jpg/png/webp/doc/docx)은 현실과 맞지 않았다. 숙박업 현장 지원자는 한글 파일과
-- 아이폰 사진으로 이력서를 낸다. 실제 데이터가 알려준 대로 넓힌다.
--
-- **html / svg 는 일부러 넣지 않는다.** 서명 URL 로 열면 스토리지 도메인에서 스크립트가 실행될 수
-- 있다. 목록에 없는 형식은 코드가 application/octet-stream 으로 낮춰 저장하므로(브라우저가 실행
-- 대신 내려받는다) 새 형식이 와도 접수를 잃지 않으면서 실행 위험은 남지 않는다.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/haansofthwp', 'application/haansoftxlsx', 'application/x-hwp',
  'application/vnd.hancom.hwp', 'application/vnd.hancom.hwpx',
  'text/plain',
  'application/octet-stream'
]
where id = 'recruit-resumes';
