# DESIGN.md → Figma Variables Bridge

DESIGN.md를 단일 소스로 두고, **Figma Professional 플랜에서도 동작하는** Plugin API 우회 경로로 Figma Variables를 동기화하는 도구 모음입니다.

```
DESIGN.md  →  CI (GitHub Actions)  →  figma-payload.json  →  Figma Plugin  →  Variables
   │                  │                       │                     │
 SSoT             lint + export         raw.githubusercontent     디자이너가
                + convert               에 자동 커밋               Import 버튼
```

## 디렉터리 구조

```
.
├── DESIGN.md                      # 단일 소스 (편집 대상)
├── tokens.json                    # CI가 생성 (DTCG)
├── figma-payload.json             # CI가 생성 (Figma용 평탄화 페이로드)
├── package.json
├── scripts/
│   └── dtcg-to-figma.mjs          # DTCG → Figma 페이로드 변환기
├── figma-plugin/                  # Figma 임포트 플러그인
│   ├── manifest.json
│   ├── code.ts                    # 메인 로직 (TypeScript)
│   ├── ui.html                    # 플러그인 UI
│   ├── tsconfig.json
│   └── package.json
└── .github/workflows/
    └── publish-tokens.yml         # CI
```

## 셋업 (1회)

### 1. 저장소 준비

이 폴더 전체를 새 GitHub 저장소에 푸시합니다. `main` 브랜치에 `DESIGN.md`가 들어 있어야 합니다.

### 2. CI 동작 확인

`DESIGN.md`를 편집해 푸시하면 워크플로우(`Publish Figma Tokens`)가 돌면서 같은 브랜치에 `tokens.json`과 `figma-payload.json`을 자동 커밋합니다.

플러그인이 실제로 fetch할 URL은 다음과 같은 형태입니다.

```
https://raw.githubusercontent.com/<OWNER>/<REPO>/main/figma-payload.json
```

비공개 저장소면 raw URL이 인증을 요구하므로, **저장소를 public으로 두거나** GitHub Pages로 별도 배포(또는 Releases 첨부)하는 식으로 풀어주세요. 가장 단순한 길은 토큰 저장소만 public으로 두는 것입니다.

### 3. Figma 플러그인 빌드

```bash
cd figma-plugin
npm install
npm run build       # code.ts → code.js 컴파일
```

빌드 결과로 `figma-plugin/code.js`가 생성됩니다.

### 4. Figma에 플러그인 등록 (개발 모드)

1. Figma 데스크톱 앱을 엽니다 (브라우저 버전은 로컬 플러그인 등록 불가)
2. 메뉴 → **Plugins → Development → Import plugin from manifest…**
3. `figma-plugin/manifest.json` 선택
4. 임의의 Figma 파일에서 **Plugins → Development → DESIGN.md Importer** 실행

팀 전체에 배포하려면 [Figma 조직용 사설 플러그인 publish](https://help.figma.com/hc/en-us/articles/4404228629655) 절차를 따릅니다(Organization 플랜 필요). Professional 플랜에서는 멤버 각자가 manifest를 import 하는 방식으로 사용합니다.

## 운영 흐름 (반복)

1. 디자이너가 `DESIGN.md`를 편집해 PR 생성
2. PR 머지 → GitHub Actions가 `figma-payload.json` 갱신 후 커밋
3. 디자이너가 Figma에서 플러그인을 열고 **Import** 클릭 → Variables 갱신
4. Figma UI에서 **Publish library**를 1회 눌러 다른 파일로 전파

## 변환기가 처리해 주는 것

| DESIGN.md 토큰 | Figma Variable |
|---|---|
| `colors.primary: "#0B71B9"` | `colors/primary` (COLOR) |
| `rounded.sm: 4px` | `rounded/sm` (FLOAT, 4) |
| `spacing.md: 16px` | `spacing/md` (FLOAT, 16) |
| `typography.h1.fontFamily` | `typography/h1/fontFamily` (STRING) |
| `typography.h1.fontSize: 3rem` | `typography/h1/fontSize` (FLOAT, 48) |
| `typography.h1.fontWeight: 700` | `typography/h1/fontWeight` (FLOAT, 700) |
| `components.button-primary.backgroundColor: "{colors.tertiary}"` | `components/button-primary/backgroundColor` (COLOR alias → `colors/tertiary`) |

핵심:
- **Typography composite는 Figma가 단일 변수로 표현 못 하므로 5개로 분해**합니다 (fontFamily, fontSize, fontWeight, lineHeight, letterSpacing). 이 분해된 변수들을 Figma의 Text Style에 일일이 바인딩하시면 됩니다.
- **`components` 섹션은 슬래시 그룹으로 평탄화**됩니다. Figma Variables 패널에서 `components/button-primary/` 폴더로 깔끔하게 묶입니다.
- **`{...}` 참조는 Figma의 Variable Alias로 변환**되어, `colors.tertiary`를 바꾸면 모든 사용처에 전파됩니다.
- `rem`/`em`은 16px 기준으로 px 환산됩니다.

## 멱등성과 안전성

- **재실행 안전**: 같은 페이로드를 여러 번 import 해도 중복 변수가 생기지 않습니다. 이름으로 매칭해 값만 갱신합니다.
- **삭제는 자동화하지 않음**: DESIGN.md에서 토큰을 제거해도 Figma의 기존 변수는 자동 삭제되지 않습니다. 수동으로 정리하세요(고의적 안전 장치 — 디자인 자산 손실 방지).
- **타입 변경 차단**: 같은 이름의 변수가 다른 타입으로 존재하면 스킵하고 경고를 출력합니다(Figma는 변수 타입을 사후 변경 불가). 이름을 바꾸거나 Figma에서 해당 변수를 삭제 후 재실행하세요.

## 확장 포인트

- **다크 모드**: `code.ts`의 `modeId` 부분을 다중 mode 처리로 확장하고, DESIGN.md를 두 개 운영하거나 변환기에서 modes를 분리하세요.
- **다중 Collection**: 페이로드 스키마에 `collections: [...]` 배열을 추가하면 Brand/Semantic 등 분리 가능.
- **자동 Publish**: REST API의 publish 엔드포인트는 Enterprise 전용이라 Professional에서는 디자이너 클릭이 1회 필요합니다.

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `HTTP 404` | raw URL 오타이거나 저장소가 private. URL 끝이 `figma-payload.json`인지, branch 이름이 `main`인지 확인. |
| `Network access denied` | `manifest.json`의 `allowedDomains`에 fetch 대상 도메인을 추가. 기본값은 `raw.githubusercontent.com`만 허용. |
| `Skipped: type mismatch` | 같은 이름의 Variable이 이미 다른 타입으로 존재. Figma에서 수동 삭제 후 재실행. |
| 색이 어둡게 보임 | hex가 sRGB로 정상이지만 디스플레이 P3 환경이면 약간 다르게 보일 수 있음(Figma는 sRGB 기준). |

## 라이선스

이 브리지 코드는 자유롭게 수정·배포 가능합니다. `@google/design.md` CLI는 Apache-2.0, Figma Plugin Typings는 MIT 라이선스를 따릅니다.
