---
extends: brands/_base
name: bigdata 260312
colors:
  primary: "#5816FF" # 주요 CTA/강조 버튼
  primary-2: "#5216FF" # 텍스트 강조/라인/포커스
  accent: "#8054FF" # 섹션 바/카드 보더 포인트
  accent-2: "#52FFFD" # 헤더 아웃라인 CTA/강조 라인
  surface-dark: "#2D3137" # 섹션 배경
  card-dark: "#23232A" # 카드/패널 배경
  ink: "#07080E" # 가장 어두운 배경 섹션
  surface-light: "#EFF2F5" # 라이트 섹션 배경
  text-on-dark: "#FFFFFF"
  text-on-light: "#141414"
  line: "#B7B8BF" # 라이트 카드 보더
typography:
  hero-subtitle:
    fontFamily: "SB Aggro"
    fontSize: 30px
    fontWeight: 300
    lineHeight: 1.2
  hero-title:
    fontFamily: "SB Aggro"
    fontSize: 86px
    fontWeight: 700
    lineHeight: 1.1
  section-title:
    fontFamily: Pretendard
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.2
  section-subtitle:
    fontFamily: Pretendard
    fontSize: 32px
    fontWeight: 300
    lineHeight: 1.3
  body-md:
    fontFamily: Pretendard
    fontSize: 24px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Pretendard
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: 5px
  sm: 8px
  md: 20px
  lg: 25px
  xl: 30px
  hero: 50px
spacing:
  sectionY: 100px
  sectionGap: 50px
  cardGap: 24px
---

## Overview

빅데이터분석기사 “합격 보장 코스” 프로모션 랜딩 시안. **다크(헤더/중간 섹션) + 라이트(후기/교재 섹션)**를 번갈아 배치해서 리듬을 만들고, 브랜드 포인트 컬러(퍼플/시안)로 CTA와 카드 보더를 강조합니다.

Figma 원본: `https://www.figma.com/design/x5T7ODnNIs3YTfELogd9g0/2026%EB%85%84?node-id=38-6`

## Layout (섹션 구성)

- **Header / Hero (다크 + 이미지/광원 데코)**
  - 상단 타이틀: “2026년도 시험 대비”, “빅데이터분석기사 합격 보장 코스”
  - 포인트: 타이틀 일부 **그라데이션 텍스트**(시안→블루→퍼플)
  - CTA 2개: 시안 아웃라인 “수강신청하기 →”, 다크 뮤트 “무료 체험 먼저 해보기”
- **Purple Divider Bar**
  - 전체 폭의 퍼플 바(강한 전환)
- **Problem Cards (다크 섹션)**
  - 3열 카드(이모지 + 고민문구 + 해답 텍스트)
  - 카드 배경 `#23232A`, 보더 `#8054FF`, 라운드 25px
- **Reason / Visual Section (다크 섹션)**
  - “지금 취득해야 하는 이유” + 시각 그래픽(이미지)
- **Instructor Quote (라이트 배경)**
  - 블랙/퍼플 텍스트로 카피 강조, 큰 따옴표 장식
- **Reviews (라이트 섹션)**
  - “생생후기” 포인트 컬러(퍼플 계열) + 3열 후기 카드
  - 태그(비전공자/1트 합격) pill 형태
- **Benefits (다크 섹션)**
  - 3개 카드 + 1개 와이드 카드(캘린더/절차)
- **Books (라이트 섹션)**
  - 교재 3권 이미지 + 설명 이미지 영역
- **Start Now (다크 섹션)**
  - CTA 메시지 + 이미지
- **Course Selector + Offer Panel (다크 섹션)**
  - 탭 버튼(선택: 퍼플 솔리드 / 비선택: 다크+그레이 텍스트)
  - 화이트 패널(보더 퍼플) + 좌측 텍스트/뱃지 + 우측 이미지 + “자세히 보기” 버튼
- **Subscription Pitch (딥다크 섹션)**
  - “월 2만원대” “200+개 강의” 퍼플 강조 + 3열 박스 + 큰 CTA

## Colors

핵심은 **퍼플 계열을 브랜드 축**으로 두고, 헤더/CTA에서 **시안으로 대비 포인트**를 만드는 구조입니다.

- **Primary CTA**: `#5816FF`
- **Emphasis / Line / Text**: `#5216FF`, `#8054FF`
- **Neon Accent**: `#52FFFD`
- **Dark surfaces**: `#2D3137`(섹션), `#23232A`(카드), `#07080E`(최암부)
- **Light surfaces**: `#EFF2F5`, `#FFFFFF`
- **Body text**: 다크 위 `#FFFFFF`, 라이트 위 `#141414`

## Typography

- **Hero(가장 상단)**: `SB Aggro` (Light/Bold), 30px/86px급 큰 사이즈, 자간을 음수로 타이트하게.
- **본문/섹션 타이틀**: `Pretendard`
  - 섹션 타이틀: 56px Bold
  - 서브 카피: 32px Light
  - 카드/후기: 18~24px Regular/Medium
  - 강조 문구: 50px Black(라이트 섹션의 강한 한 줄 카피)

## Components (재사용 단위)

- **Hero CTA 버튼(2종)**
  - 아웃라인 CTA: 시안 보더 + 시안 텍스트, 배경 투명, 높이 68px
  - 보조 CTA: 블랙 배경 + 뮤트 보더/텍스트, 높이 68px
- **다크 카드**
  - 배경 `#23232A`, 보더 `#8054FF`, 라운드 25px, 세로형 3열 반복
- **라이트 후기 카드**
  - 배경 흰색, 보더 `#B7B8BF`, 라운드 25px
  - 태그 pill: 다크 그레이(`#595B66`) / 퍼플(`#5216FF`) 2종
- **탭 버튼**
  - 선택: 퍼플 솔리드 + 화이트 텍스트
  - 비선택: 다크 솔리드 + 그레이 텍스트(`~#67697F`)
