# DJRPG 협업 및 Git 작업 정책

> 적용 대상: DJRPG 저장소에서 서로 다른 PC로 작업하는 모든 협업자  
> 목적: 같은 브랜치에 동시에 Push하면서 발생하는 non-fast-forward 및 작업 덮어쓰기 문제를 예방한다.

## 1. 기본 원칙

1. **각 작업자는 반드시 자신의 작업 브랜치에서 작업한다.**
2. `main` 브랜치에 직접 Commit 또는 Push하지 않는다.
3. 서로 다른 파일을 수정하더라도 같은 브랜치를 공유하지 않는다. 원격 브랜치는 한 번에 한 작업 흐름으로 갱신되므로, 같은 브랜치에 동시 Push하면 충돌할 수 있다.
4. 작업 결과는 Pull Request(PR)를 통해 `main`에 통합한다.
5. 다른 작업자의 미완료 커밋을 임의로 수정하거나 강제 Push로 덮어쓰지 않는다.

## 2. 브랜치 이름과 사용 방법

작업 단위로 브랜치를 만든다.

- 기능 추가: `feature/<기능명>-<작업자>`
- 오류 수정: `fix/<수정내용>-<작업자>`
- 문서 변경: `docs/<문서주제>-<작업자>`
- 긴급 수정: `hotfix/<수정내용>-<작업자>`

예시:

- `feature/auto-hunting-dj`
- `feature/market-api-kim`
- `fix/inventory-save-dj`
- `docs/collaboration-kim`

작업자 이름 또는 GitHub ID를 접미사로 사용해 브랜치 소유자를 구분한다. 하나의 브랜치를 두 사람이 동시에 작업하는 공용 작업 브랜치로 사용하지 않는다.

## 3. 작업 시작 절차

새 작업을 시작할 때는 항상 최신 `main`에서 새 브랜치를 만든다.

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/<기능명>-<작업자>
```

이미 원격에 존재하는 본인 작업 브랜치를 이어서 작업할 때:

```bash
git fetch origin
git switch <본인-작업-브랜치>
git pull --ff-only origin <본인-작업-브랜치>
```

## 4. 작업 중 Commit 및 Push

작업 내용은 작고 명확한 단위로 Commit한다.

```bash
git status
git add <수정한-파일>
git commit -m "feat: 작업 내용"
git push -u origin <본인-작업-브랜치>
```

같은 브랜치에 다른 PC 또는 다른 작업자가 Push하지 않도록 한다. 작업 브랜치도 원칙적으로 해당 작업자만 Push한다.

## 5. main 최신 내용 반영

작업 중 `main`에 다른 사람의 변경 사항이 병합되었다면, 본인 작업 브랜치에 최신 `main`을 반영한다.

```bash
git fetch origin
git switch <본인-작업-브랜치>
git rebase origin/main
```

충돌이 발생하면 충돌 파일을 직접 확인하고 해결한 뒤:

```bash
git add <해결한-파일>
git rebase --continue
```

Rebase를 취소해야 하는 경우:

```bash
git rebase --abort
```

이미 원격에 Push한 본인 브랜치를 Rebase한 경우에는 일반 Push가 거절될 수 있다. 이때 해당 브랜치를 본인만 사용하고 다른 작업자가 가져가지 않았음을 확인한 뒤 다음 명령을 사용한다.

```bash
git push --force-with-lease origin <본인-작업-브랜치>
```

공용 브랜치 또는 다른 작업자의 브랜치에는 Force Push하지 않는다.

## 6. Pull Request 및 병합

1. 작업 완료 후 본인 브랜치에서 `main`을 대상으로 PR을 생성한다.
2. PR에는 변경 목적, 주요 수정 파일, 테스트 결과, 주의 사항을 작성한다.
3. 다른 작업자가 변경 내용을 검토한다.
4. 프로젝트에 설정된 검사 및 빌드를 통과한 뒤 `main`에 병합한다.
5. 병합된 작업 브랜치는 삭제해도 된다. 추가 작업이 필요하면 최신 `main`에서 새 브랜치를 만든다.

## 7. 동시 작업 시 주의사항

- 서로 다른 파일을 수정하더라도 같은 브랜치에 Push하지 않는다.
- 공통 파일(타입 정의, 저장 데이터 구조, API 계약, 패키지 설정, 공통 UI 진입점 등)을 수정할 예정이면 먼저 상대 작업자에게 알린다.
- 같은 기능 또는 서로 의존하는 기능을 동시에 변경할 때는 변경 범위와 인터페이스를 먼저 합의한다.
- `package.json`, lock 파일, DB 스키마, 공용 타입을 변경하면 PR 설명에 영향 범위를 명시한다.
- 작업 시작 전과 PR 생성 전에는 `git status`로 미커밋 변경 사항을 확인한다.
- 충돌이 발생하면 무조건 한쪽 파일로 덮어쓰지 말고 변경 의도를 비교해 통합한다.

## 8. Push 거절(non-fast-forward) 시 대응

Push가 거절되면 반복해서 Push하거나 강제 Push하지 않는다.

1. 현재 브랜치가 본인 작업 브랜치인지 확인한다.
2. `git status`로 미커밋 변경 사항을 확인한다.
3. `git fetch origin`으로 원격 상태를 갱신한다.
4. 본인 작업 브랜치라면 `git pull --rebase origin <본인-작업-브랜치>`로 원격 커밋을 반영한다.
5. 충돌을 해결하고 다시 Push한다.
6. 다른 사람이 같은 브랜치에 작업한 사실을 확인했다면 임의로 Rebase/Force Push하지 말고 먼저 협의한다.

## 9. 최소 협업 규칙 요약

- `main` 직접 Push 금지
- 작업자별·작업별 브랜치 분리
- 한 브랜치에 한 작업자만 Push
- 최신 `main`에서 작업 시작
- PR 검토 후 병합
- 공통 파일 및 데이터 계약 변경은 사전 공유
- Force Push는 본인 전용 브랜치에서만 필요한 경우에 한해 `--force-with-lease` 사용

이 정책은 협업 중 데이터 손실과 Push 충돌을 줄이기 위한 저장소 작업 규칙이다. 게임 기획 내용이나 게임 기능의 개발 요구사항을 정의하는 문서는 아니다.
