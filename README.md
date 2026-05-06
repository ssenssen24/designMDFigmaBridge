# DESIGN.md → Figma Variables Bridge (v2: 멀티 브랜드 + 프로모션)

여러 DESIGN.md를 **`_base` 공통 토큰 + 브랜드 오버라이드 + 프로모션 오버라이드** 방식으로 관리하고, 각각을 Figma의 독립 컬렉션으로 동기화합니다.

```
brands/_base/DESIGN.md          ─┐
                                  │ deep merge
brands/heritage/DESIGN.md       ─┘─┐
                                    │ deep merge (3-level)
promotions/2026-spring/DESIGN.md ──┘
        │
        │ CI: lint → DTCG export → 평탄화
        ▼
payloads/2026-spring.json + manifest.json (raw URL 노출)
        │
        │ Figma Plugin: manifest fetch → 체크박스 다중 선택 → 일괄 import
        ▼
Figma Variables: Heritage / Modern / 2026-spring / 2026-summer 컬렉션 (독립)
```

## 디렉터리 구조

```
.
├── brands/
│   ├── _base/DESIGN.md         # 공통 spacing, rounded, base typography
│   ├── heritage/DESIGN.md      # extends: brands/_base
│   └── modern/DESIGN.md        # extends: brands/_base
├── promotions/
│   ├── 2026-spring/DESIGN.md   # extends: brands/heritage
│   ├── 2026-summer/DESIGN.md   # extends: brands/modern
│   └── _archive/               # 종료된 캠페인 (CI 스킵)
├── payloads/                   # CI 자동 생성 — 손대지 마세요
│   ├── heritage.json
│   ├── modern.json
│   ├── 2026-spring.json
│   ├── 2026-summer.json
│   └── manifest.json           # 플러그인이 읽는 인덱스
├── scripts/
│   ├── merge.mjs               # extends 체인 머지
│   └── dtcg-to-figma.mjs       # DTCG → Figma payload 평탄화
├── figma-plugin/               # 디자이너 PC에서 빌드 후 사용
└── .github/workflows/publish-tokens.yml
```

## 상속 규칙: `extends`

각 DESIGN.md 머리에 `extends`를 적으면, CI가 그 부모를 찾아 deep merge한 결과를 lint·export 합니다.

```yaml
---
extends: brands/heritage    # 저장소 루트 기준 경로 (DESIGN.md 자동 추가)
name: 2026 Spring
expires: 2026-06-30         # 메타데이터 (운영용, 토큰엔 영향 없음)
colors:
  accent: "#88B04B"         # Heritage에 없던 새 토큰 — 추가됨
  primary: "#0F172A"        # Heritage의 primary를 덮어씀
---
```

머지 동작:
- **객체는 깊게(deep) 머지** — `colors` 안에서 `primary`만 바꾸면 다른 색은 부모 그대로
- **배열·원시값은 자식이 통째로 대체**
- **사이클 검출** — `A→B→A` 같은 순환 참조는 빌드 실패
- **`extends` 없으면 단독 파일로 처리**
- **`extends`, `expires` 같은 메타 필드는 export 시 제거**

## 셋업 (1회)

### 1. 저장소 push

이 폴더 전체를 GitHub 저장소(public 권장)에 push합니다. push 직후 `Publish Figma Tokens` 워크플로우가 4개 컬렉션을 자동 빌드하고 `payloads/`를 commit합니다.

### 2. Workflow 권한

저장소 → **Settings → Actions → General → Workflow permissions** → **Read and write permissions** → Save.

### 3. Manifest URL 확인

CI 완료 후 다음 URL이 살아있는지 브라우저로 확인:

```
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/payloads/manifest.json
```

JSON이 보이면 OK. 디자이너에게 이 URL을 공유합니다.

### 4. Figma 플러그인 빌드 & 등록 (디자이너 PC에서)

```bash
cd figma-plugin
npm install
npm run build
```

Figma 데스크톱 앱 (브라우저 ❌) → **Plugins → Development → Import plugin from manifest…** → `figma-plugin/manifest.json`.

### 5. 첫 사용

플러그인 실행 → "Manifest URL" 펼침 → 위 URL 붙여넣기 → **Load manifest**. 컬렉션 4개가 목록에 나타납니다. 원하는 것을 체크하고 **Import** 클릭.

## 일상 운영

### DESIGN.md 편집 흐름

1. `brands/heritage/DESIGN.md` 또는 `promotions/2026-spring/DESIGN.md` 편집
2. PR 생성 → 머지
3. 30초 후 `payloads/`가 자동 갱신됨
4. 디자이너가 Figma에서 플러그인 → Import (URL 다시 입력 불필요, 저장됨)

### 새 브랜드 추가

```bash
mkdir brands/newbrand
cat > brands/newbrand/DESIGN.md << 'EOF'
---
extends: brands/_base
name: NewBrand
colors:
  primary: "#000000"
  ...
---
## Overview
...
EOF
git add brands/newbrand && git commit -m "feat: add NewBrand" && git push
```

CI가 자동으로 `newbrand`를 발견·빌드합니다. 워크플로우 yml 수정 불필요.

### 새 프로모션 추가

`promotions/YYYY-name/DESIGN.md`로 만들고 `extends:`에 어느 브랜드를 베이스로 할지 적습니다.

### 프로모션 종료

```bash
git mv promotions/2026-spring promotions/_archive/2026-spring
git commit -m "chore: archive 2026 Spring promo (expired)" && git push
```

`_archive/` 폴더는 CI에서 스킵되므로 manifest와 payload에서 사라집니다. **Figma의 컬렉션은 자동 삭제되지 않으므로**, 사용처 확인 후 디자이너가 Figma UI에서 수동 삭제합니다.

## v1에서 v2로 마이그레이션

기존 v1 저장소를 그대로 쓰고 있다면:

1. **백업**: 현재 `DESIGN.md`를 어딘가에 복사
2. **폴더 만들기**:
   ```bash
   mkdir -p brands/_base brands/<your-brand-name> promotions
   ```
3. **DESIGN.md 분할**:
   - 공통 토큰(spacing, rounded, base typography)을 `brands/_base/DESIGN.md`로
   - 브랜드별 토큰(colors, h1 등)을 `brands/<your-brand-name>/DESIGN.md`로
   - 후자에 `extends: brands/_base` 추가
4. **변환기와 워크플로우 교체**:
   - `scripts/dtcg-to-figma.mjs`는 v1과 동일 (그대로 유지 가능)
   - `scripts/merge.mjs`는 새로 추가
   - `.github/workflows/publish-tokens.yml`은 v2 버전으로 교체
5. **루트 `DESIGN.md` 삭제** (`brands/`로 이동했으므로)
6. **`package.json`에 `js-yaml` 의존성 추가** (또는 v2 package.json 사용)
7. **플러그인 v2로 교체** & 디자이너 재import
8. **첫 푸시 후 Figma 컬렉션 변경**:
   - 기존 `Brand` 컬렉션 → 사용처 그대로 두고
   - 새로 생긴 `<your-brand-name>` 컬렉션으로 단계적 마이그레이션
   - 모든 컴포넌트가 새 컬렉션을 참조하면 `Brand` 컬렉션 수동 삭제

## 변환기가 처리하는 것 (v1과 동일)

| DESIGN.md | Figma Variable |
|---|---|
| `colors.primary: "#1A1C1E"` | `color/primary` (COLOR) |
| `rounded.sm: 4px` | `rounded/sm` (FLOAT) |
| `typography.h1` (composite) | `typography/h1/fontFamily`, `…/fontSize`, `…/fontWeight`, `…/lineHeight`, `…/letterSpacing` (5개로 분해) |
| `"{colors.tertiary}"` 참조 | Variable Alias (Figma 내부 참조) |

## 트러블슈팅

| 증상 | 해결 |
|---|---|
| CI에서 `Cannot resolve "extends: ..."` | extends 경로가 저장소 루트 기준인지, 해당 폴더에 DESIGN.md가 있는지 확인 |
| CI에서 `Inheritance cycle detected` | 부모-자식이 서로 참조함. 한쪽 extends 제거 |
| 플러그인 `HTTP 404` | manifest URL 오타 또는 저장소 private. URL 끝이 `manifest.json`인지 확인 |
| 플러그인이 `Network access denied` | 다른 호스팅(예: GitHub Pages 커스텀 도메인) 쓰면 plugin manifest의 `allowedDomains`에 추가 |
| Figma에서 `Type mismatch` 경고 | 같은 변수명이 다른 타입으로 이미 존재. Figma에서 수동 삭제 후 재import |
| 컬렉션이 너무 많아 헷갈림 | 플러그인 툴바의 "Brands only" / "Promotions only" 필터 사용 |

## 고급: `_base` 분리 운영

토큰이 늘어나면 `_base`도 여러 파일로 쪼갤 수 있습니다.

```yaml
# brands/_typography/DESIGN.md
---
name: Typography Base
typography:
  body-md: { ... }
  body-sm: { ... }
---
# brands/heritage/DESIGN.md
---
extends: brands/_typography  # 여러 단계 상속도 가능
...
---
```

체인은 깊이 제한이 없지만 5단계 이상은 추적이 어려워지니 권장하지 않습니다.

## 라이선스

이 브리지 코드는 자유롭게 수정·배포 가능합니다. `@google/design.md` CLI는 Apache-2.0, Figma Plugin Typings는 MIT입니다.
