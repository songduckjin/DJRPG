# DJRPG Codex GitHub Actions 운영 가이드

기준일: 2026-11-17. 이 문서는 `songduckjin/DJRPG`의 Issue 라벨 실행을 위한 운영·보안·비용 안내다. 자동화 PR이 검토·병합되어야 워크플로가 기본 브랜치에서 실제로 실행된다. 현재 PR #20의 작업 92와 실행 코드, 세이브/API/DB 계약은 이 작업에서 변경하지 않는다.

## 1. 구성과 역할

```text
songduckjin이 직접 생성·담당한 Issue에 codex-ready 추가
  → main의 TASK_N.md·TASK.md와 GitHub 권한 사전 검증
  → songduckjin 전용 API 키로 격리된 Codex 작업
  → 선언된 파일만 패치 아티팩트로 전달
  → 별도 권한 작업에서 패치 재검증 후 작업별 PR 생성
  → 성공·실패 상태를 원래 Issue에 기록
  → 사용자 검토 후에만 main 병합
```

| 주체 | 역할·권한 | 비용 부담 |
|---|---|---|
| GitHub 개인 저장소 `songduckjin` | 저장소 소유, `main` 보호, 공통 변경 승인, Actions/Secrets 설정 | GitHub Actions 사용량은 저장소의 GitHub 결제 설정에 따름 |
| `songduckjin` | 본인 Issue의 Codex 자동 실행, 작업 지시·브랜치·PR 관리 | `OPENAI_API_KEY_SONGDUCKJIN`이 속한 API 조직/프로젝트로 귀속 |
| `fks3997` | 기존 수동 개발·개인 작업지시서·브랜치·PR 절차 유지; Codex 자동화 대상 제외 | 이 GitHub 자동화의 API 비용 없음 |
| ChatGPT 개인 계정·Business 계정 2개 | 대화형 Codex 이용 권한과 구독 관리 | GitHub Action에 전달한 API 키의 청구 주체를 바꾸지 않음 |
| OpenAI API 조직/프로젝트 | 키 발급, 모델 접근, 사용량·예산·청구 관리 | 실제 API 요청을 인증한 키가 속한 API 조직에 과금 |

OpenAI는 [ChatGPT와 API 결제를 별개](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform)로 운영한다. [ChatGPT Business 구독에도 API 사용량은 포함되지 않는다](https://help.openai.com/en/articles/8542115-chatgpt-business-faq). 같은 사람이 세 ChatGPT 계정으로 로그인할 수 있어도 GitHub Action은 구독 좌석이 아니라 `openai-api-key`에 전달된 **API Platform 키**로 호출한다. 개인 구독 혜택의 API 크레딧도 [API 키를 통한 Codex 사용에는 적용되지 않을 수 있으므로](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions), 해당 조직의 청구 화면에서 확인한다.

### 단일 키의 청구 주체 선택

| 키 발급 위치 | 장점 | 비용·운영 주의점 |
|---|---|---|
| `songduckjin`의 개인 API 조직 안 자동화 전용 프로젝트 | 개인 결제·예산·사용량 추적이 명확 | 개인 API 조직에 청구 |
| 별도 Business 소유 API 조직 안 자동화 전용 프로젝트 | 조직 결제·예산·사용량 추적이 명확 | 해당 API 조직의 소유자가 키·지출을 관리; ChatGPT Business 좌석만으로 API 이용 권한이 생기지 않음 |

자동화 전용 API 프로젝트 하나에서 키 하나를 발급해 `OPENAI_API_KEY_SONGDUCKJIN`으로 등록한다. 청구 주체를 바꿀 때는 새 API 조직/프로젝트의 키로 **같은 GitHub Secret의 값만 교체**한다. `fks3997`용 키나 Secret은 이 워크플로에 필요하지 않다. Business 워크스페이스 소유권이나 GitHub 계정 소유권만으로 API 청구가 자동 분리되지는 않는다. [API 프로젝트](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)는 키, 서비스 계정, 모델 접근, 사용량과 지출 한도를 구분한다.

## 2. 실제 설정: 사람이 해야 할 일

1. `songduckjin`이 비용을 부담할 API 조직에서 결제와 자동화 전용 프로젝트를 설정한다. **프로젝트 서비스 계정 키** 또는 제한된 프로젝트 키를 만들고 필요한 모델 접근과 권한만 부여한다. [키는 생성 직후 한 번만 표시](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)되므로 안전하게 보관한다.
2. 저장소 Settings → Secrets and variables → Actions → Repository secrets에 `OPENAI_API_KEY_SONGDUCKJIN` 하나만 등록한다. 기존 `OPENAI_API_KEY_FKS3997`가 있다면 이 자동화에 필요하지 않으므로 저장소 소유자가 사용처를 확인한 뒤 제거한다. 키 값은 이 문서, Issue, PR, `.env`, 코드, 로그에 적지 않는다. [GitHub Secrets 안내](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)에 따라 교체 시 새 키를 같은 이름의 Secret에 저장하고, 성공 확인 후 구 키를 폐기한다.
3. Settings → Actions → General에서 Actions를 허용하고, **Allow GitHub Actions to create and approve pull requests** 중 *create* 기능을 허용한다. 워크플로는 PR을 승인하거나 병합하지 않는다. 저장소 기본 `GITHUB_TOKEN`은 최소 읽기 권한으로 유지하고 각 job에서 필요한 권한만 추가한다. 개인 저장소의 기본 PR 생성 설정은 꺼져 있을 수 있다. [GitHub 설정 문서](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).
4. `main` 브랜치 보호/규칙에서 PR·필수 CI·담당자 검토를 요구하고 자동 병합을 켜지 않는다. 사용자 최종 승인 전에는 PR을 병합하지 않는다. GitHub 계정 `songduckjin`, `fks3997`의 저장소 쓰기 권한을 확인한다.
5. `codex-ready`와 공통 영역 승인을 뜻하는 `shared-approved` 라벨을 만든다. 공통 승인 라벨은 **`songduckjin`이 직접 추가**해야 사전 검증을 통과한다. 라벨 제거·재추가로 비용이 다시 발생할 수 있으므로 한 Issue의 실행 기록과 PR을 먼저 확인한다.

이 세션에는 API 키 값이나 GitHub Settings/Secrets에 대한 관리 권한이 제공되지 않아 **실제 키 등록·결제·브랜치 보호 설정 상태는 확인하거나 수행하지 않았다**. 워크플로에는 키 이름만 들어간다.

## 3. Issue에서 자동 실행하는 절차

자동 실행은 다음이 모두 충족될 때만 시작한다. 사전 검증은 API 키에 접근하기 전에 완료된다.

1. `main`에 `docs/TASK_N.md`가 **검토된 PR을 통해** 반영되어 있어야 한다. 제목은 `# 작업지시서 N`으로 시작하고 아래 필드를 포함한다.

   ```md
   # 작업지시서 94 — 예시
   - 담당자: songduckjin
   - 상태: [-] 진행 중
   - 자동 실행 승인: yes
   - 자동화 수정 파일: src/ui/modals/exampleModal.ts, tests/example.test.mjs
   ```

   파일 목록은 저장소 기준의 **정확한 경로**를 쉼표로 나열한다. 와일드카드와 `..` 경로는 허용하지 않는다. 승인 전·진단 대기 상태에는 `자동 실행 승인: yes`를 넣지 않는다.
2. `docs/TASK.md` 공개 표에 동일 작업 번호·담당자를 `[-]`로 선등록한다. 다른 `[-]` 작업의 수정 예정 파일과 겹치지 않는지 검토한다. 작업지시서와 표의 변경도 `main` 직접 푸시가 아닌 PR 검토로 반영한다.
3. `songduckjin`이 Issue를 직접 만들고 제목을 `[작업 N] ...` 또는 `[Task N] ...`으로 적으며 본인 한 명만 담당자로 지정한다. `songduckjin`이 `codex-ready`를 추가한다. Issue 생성자·라벨 추가자·단독 담당자·지시서 담당자가 모두 `songduckjin`이고 저장소 쓰기 권한이 있어야 한다. `fks3997`의 Issue는 이 자동화에서 거부된다.
4. 공통 파일(`AGENTS.md`, `docs/TASK.md`, `docs/WORKLOG.md`, `src/main.ts`, `store.ts`, `items.ts`, `sync.ts`, `server/database.mjs`) 또는 `.github/`, `api/`, `server/`를 수정하려면 먼저 영향과 승인 범위를 Issue에 명시하고 `songduckjin`이 `shared-approved`를 추가한다.
5. 워크플로는 공개 표의 다른 진행 작업과 열린 PR에서 **정확히 같은 파일 경로**가 이미 쓰이는지 검사한다. `docs/TASK.md`, `docs/WORKLOG.md`는 공통 승인 라벨로 관리한다. 디렉터리 수준·동일 데이터 계약의 의미상 충돌까지 자동 판정하지 못하므로 담당자가 먼저 확인한다.

작업 브랜치는 `codex/task-N-songduckjin-issue-번호`로 고정된다. 브랜치가 이미 있으면 재실행을 거부한다. Issue별 `concurrency`가 중복 실행을 순서대로 대기시키며, 재라벨 시 추가 실행 비용을 막기 위해 기존 브랜치 검사도 한다. Codex는 체크아웃에 푸시 자격 증명을 받지 않으며, 작업 파일 밖의 변경은 PR 게시 전에 거부한다. PR 제목과 본문에는 작업 번호·담당자·원본 Issue가 표시된다. `fks3997`의 기존 작업·브랜치·PR·수동 개발 절차는 변경하지 않는다.

`docs/TASK_92.md`는 PR #20 브랜치에 있다. 한편 최신 `main`의 공개 표에는 `fks3997`의 장비 UI 작업도 92로 적혀 있어 **번호가 중복**된다. 이 작업에서는 어느 쪽의 번호·상태·지시 내용도 바꾸지 않는다. 소유자가 번호를 정리하고 해당 지시서를 자동 실행 승인 형식으로 `main`에 반영하기 전에는 92를 자동 실행하지 않는다. **최종 자동화는 PR #23 한 곳에서 관리**하며, PR #20에서는 중복 워크플로 파일만 제거해 작업 92 문서 PR로 유지한다.

## 4. 권한·격리 점검

| 단계 | GitHub 권한 | 비밀키 | 산출물 |
|---|---|---|---|
| `preflight` | contents/issues/PR 읽기 | 없음 | 담당자·문서·상태·파일·충돌 검증 |
| `codex` | contents/issues 읽기 | `OPENAI_API_KEY_SONGDUCKJIN`만 | 작업 디렉터리 변경, 선언된 파일의 패치 아티팩트 |
| `publish` | contents/PR 쓰기 | OpenAI 키 없음 | 패치 파일 재검증, 별도 작업 브랜치와 PR |
| `report` | issues 쓰기 | 없음 | 성공/실패와 Actions 실행 링크를 Issue에 댓글 |

`openai/codex-action@v1`에는 `permission-profile: ':workspace'`, `safety-strategy: drop-sudo`를 사용한다. [공식 보안 안내](https://github.com/openai/codex-action/blob/main/docs/security.md)는 좁은 권한, 키 보호, Codex 실행과 권한 있는 후속 작업의 분리를 권장한다. 이 워크플로는 별도 게시 job에서 패치를 재검증하지만, Codex job은 결과 패치를 아티팩트로 올리는 후속 단계가 필요하다. 따라서 승인된 코드와 의존성도 검토하고, API 프로젝트 지출 한도와 `main` 보호를 함께 적용한다.

GitHub의 `GITHUB_TOKEN`으로 생성한 PR은 보통 다른 워크플로 실행을 새로 유발하지 않는다. 따라서 생성된 PR의 필수 CI가 자동으로 시작되는지 저장소에서 확인하고, 실행되지 않으면 권한 있는 사람이 수동 실행/승인한다. 자동 CI가 꼭 필요하면 GitHub App 토큰 도입을 **별도 보안 작업**으로 검토한다. 개인 PAT를 즉석에서 추가하지 않는다. [GitHub 토큰 동작](https://docs.github.com/en/actions/concepts/security/github_token).

## 5. 비용 산정과 예산

Codex Action의 API 요청은 선택된 **API 프로젝트/조직**에 과금된다. ChatGPT 개인·Business 구독료는 별도다. GitHub Actions 러너 사용량은 GitHub 청구 체계에 따르며 API 비용과 구분한다. 현재 워크플로는 모델을 고정하지 않으므로 실행 당시 Codex가 선택한 모델과 [공식 API 가격표](https://developers.openai.com/api/docs/pricing)를 기록해야 실제 금액을 계산할 수 있다.

작업 1건의 근사식(미국 달러):

```text
비용 ≈ (비캐시 입력 토큰 × 입력 단가
       + 캐시 입력 토큰 × 캐시 입력 단가
       + 출력 토큰 × 출력 단가) / 1,000,000
       + 사용한 유료 도구·저장 비용
```

예시로 2026-11-17 공식 가격표의 **Standard `gpt-6.1-sol`** 단가(입력 $2, 캐시 입력 $0.10, 출력 $10 / 백만 토큰)를 적용하면, 비캐시 입력 20만·캐시 입력 10만·출력 3만 토큰의 추정치는 **$0.71**이다. 이는 모델·처리 등급·토큰량을 가정한 예시이며 이번 저장소의 측정 비용이 아니다. 여러 번의 도구 호출·재시도·긴 테스트 로그가 토큰을 늘릴 수 있다. [가격표](https://developers.openai.com/api/docs/pricing)는 수시로 바뀌므로 견적 시 다시 확인한다.

각 프로젝트의 API Platform **Usage Dashboard**에서 기간·프로젝트 사용량을 확인하고 작업 수로 나눠 평균 비용을 구한다. 지출은 프로젝트/조직별 **Monthly spend limit**과 50%·80%·100% 알림을 설정한다. 실제 차단이 필요하면 **Enforce a hard limit**도 켠다. 알림만 설정하면 요청은 계속되며, 강제 한도도 집계 지연으로 약간 초과할 수 있다. [OpenAI 프로젝트 한도 안내](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform). 처음에는 낮은 한도와 소수의 시험 작업으로 운영하고, 실제 토큰량을 확인한 뒤 조정한다.

## 6. 장애 대응과 변경 관리

| 증상 | 확인·조치 |
|---|---|
| 라벨을 붙여도 실행되지 않음 | 워크플로가 `main`에 병합됐는지, 정확히 `codex-ready`인지, Actions 허용 여부를 확인. PR 브랜치에만 있는 워크플로는 Issue 이벤트로 실행되지 않음. |
| 사전 검증 실패 | Issue 제목·한 명의 담당자·지시서 번호·`[-]`/`yes`·공개 표·공통 승인 라벨·기존 PR/브랜치를 확인. 실패 댓글의 Actions 링크에서 오류를 찾음. |
| API 인증/한도 오류 | `OPENAI_API_KEY_SONGDUCKJIN`, API 키 유효성·프로젝트 모델 접근·API 결제·월 한도를 점검. 키 값은 로그에 복사하지 않음. |
| PR 생성 실패 | Settings → Actions → General의 PR 생성 허용과 `GITHUB_TOKEN` job 권한, 패치의 선언 파일 범위, 기존 브랜치를 확인. |
| 결과 파일이 범위 밖임 | 게시 단계가 거부한다. 작업지시서 범위가 실제로 확장돼야 한다면 승인된 PR로 문서를 수정한 후 새 Issue/브랜치에서 다시 실행. |
| 작업이 겹침 | 공개 `[-]` 표와 열린 PR을 확인해 순서·담당을 합의. 공통 계약 수정은 `shared-approved`와 별도 검토. |
| 키 유출 의심 | API Platform에서 키를 즉시 폐기·교체하고 GitHub Secret을 갱신한 뒤 Usage와 Actions 로그를 점검. |

워크플로 변경 자체는 보안 영향이 큰 공통 변경이다. 이 PR의 검토, 정적 검증, GitHub 설정 확인과 시험 Issue 실행이 끝난 뒤에만 사용자가 `main` 병합을 승인한다. 자동화가 생성한 PR도 같은 기준으로 개별 검토한다.
