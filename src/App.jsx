import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleAlert,
  ListChecks,
  RotateCcw,
  Search,
  Shuffle,
  Trophy,
  X,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { questions } from "./data/questions.js";

const STORAGE_KEY = "pam-test-progress-v1";

function shuffleItems(items) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function normalizeAnswer(answer) {
  return answer
    .slice()
    .sort((a, b) => a - b)
    .join(",");
}

function readSavedProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      misses: Array.isArray(parsed.misses) ? parsed.misses : [],
      lastScore: parsed.lastScore || null,
    };
  } catch {
    return { misses: [], lastScore: null };
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function getCorrectIndexes(question) {
  return question.options
    .map((option, index) => (option.correct ? index : null))
    .filter((index) => index !== null);
}

function getQuestionKind(question) {
  if (!question || question.type === "open") return question?.type || "single";
  return getCorrectIndexes(question).length > 1 ? "multi" : question.type;
}

function scoreAnswer(question, answer, checked, selfScore) {
  const questionKind = getQuestionKind(question);

  if (questionKind === "open") {
    if (!checked) return false;
    return selfScore === "correct";
  }

  if (!checked) return false;
  const selected = Array.isArray(answer) ? answer : answer === undefined ? [] : [answer];
  return normalizeAnswer(selected) === normalizeAnswer(getCorrectIndexes(question));
}

function App() {
  const categories = useMemo(
    () => ["Všetky témy", ...Array.from(new Set(questions.map((question) => question.category)))],
    []
  );

  const [progress, setProgress] = useState(readSavedProgress);
  const [selectedCategory, setSelectedCategory] = useState("Všetky témy");
  const [mode, setMode] = useState("all");
  const [shuffle, setShuffle] = useState(true);
  const [view, setView] = useState("test");
  const [query, setQuery] = useState("");
  const [session, setSession] = useState(() =>
    createSession({ category: "Všetky témy", mode: "all", shuffle: true, misses: [] })
  );

  const currentQuestion = session.items[session.index];
  const answer = session.answers[currentQuestion?.id];
  const checked = Boolean(session.checked[currentQuestion?.id]);
  const selfScore = session.selfScores[currentQuestion?.id];
  const correct = currentQuestion
    ? scoreAnswer(currentQuestion, answer, checked, selfScore)
    : false;

  const sessionStats = useMemo(() => {
    const checkedCount = session.items.filter((question) => session.checked[question.id]).length;
    const correctCount = session.items.filter((question) =>
      scoreAnswer(
        question,
        session.answers[question.id],
        session.checked[question.id],
        session.selfScores[question.id]
      )
    ).length;

    return {
      checkedCount,
      correctCount,
      total: session.items.length,
      percent: session.items.length ? Math.round((correctCount / session.items.length) * 100) : 0,
    };
  }, [session]);

  const filteredBank = useMemo(() => {
    const cleanQuery = query.trim().toLocaleLowerCase("sk-SK");
    return questions.filter((question) => {
      const categoryMatch =
        selectedCategory === "Všetky témy" || question.category === selectedCategory;
      const queryMatch =
        !cleanQuery ||
        question.question.toLocaleLowerCase("sk-SK").includes(cleanQuery) ||
        question.options.some((option) => option.text.toLocaleLowerCase("sk-SK").includes(cleanQuery)) ||
        question.answer?.toLocaleLowerCase("sk-SK").includes(cleanQuery);
      return categoryMatch && queryMatch;
    });
  }, [query, selectedCategory]);

  function createAndApplySession(nextSettings = {}) {
    const category = nextSettings.category ?? selectedCategory;
    const nextMode = nextSettings.mode ?? mode;
    const nextShuffle = nextSettings.shuffle ?? shuffle;
    const nextSession = createSession({
      category,
      mode: nextMode,
      shuffle: nextShuffle,
      misses: progress.misses,
    });

    setSelectedCategory(category);
    setMode(nextMode);
    setShuffle(nextShuffle);
    setSession(nextSession);
    setView("test");
  }

  function updateAnswer(questionId, value) {
    setSession((current) => ({
      ...current,
      answers: { ...current.answers, [questionId]: value },
      checked: { ...current.checked, [questionId]: false },
      selfScores: { ...current.selfScores, [questionId]: undefined },
    }));
  }

  function toggleMulti(questionId, index) {
    const selected = Array.isArray(session.answers[questionId]) ? session.answers[questionId] : [];
    const next = selected.includes(index)
      ? selected.filter((item) => item !== index)
      : [...selected, index];
    updateAnswer(questionId, next);
  }

  function checkCurrent() {
    if (!currentQuestion) return;
    setSession((current) => ({
      ...current,
      checked: { ...current.checked, [currentQuestion.id]: true },
    }));
  }

  function setOpenSelfScore(score) {
    if (!currentQuestion) return;
    setSession((current) => ({
      ...current,
      selfScores: { ...current.selfScores, [currentQuestion.id]: score },
    }));
  }

  function goToQuestion(index) {
    setSession((current) => ({
      ...current,
      index: Math.min(Math.max(index, 0), current.items.length - 1),
    }));
  }

  function finishSession() {
    const missedIds = session.items
      .filter((question) => {
        return !scoreAnswer(
          question,
          session.answers[question.id],
          session.checked[question.id],
          session.selfScores[question.id]
        );
      })
      .map((question) => question.id);

    const stillMisses = new Set(progress.misses);
    session.items.forEach((question) => {
      const isCorrect = scoreAnswer(
        question,
        session.answers[question.id],
        session.checked[question.id],
        session.selfScores[question.id]
      );
      if (isCorrect) stillMisses.delete(question.id);
      else stillMisses.add(question.id);
    });

    const updated = {
      misses: Array.from(stillMisses),
      lastScore: {
        date: new Date().toISOString(),
        correct: sessionStats.correctCount,
        total: sessionStats.total,
        percent: sessionStats.percent,
      },
    };
    saveProgress(updated);
    setProgress(updated);
    setSession((current) => ({ ...current, completed: true, missedIds }));
  }

  function resetHistory() {
    const empty = { misses: [], lastScore: null };
    saveProgress(empty);
    setProgress(empty);
    createAndApplySession({ mode: "all" });
  }

  function practiceQuestion(questionId) {
    const itemIndex = session.items.findIndex((item) => item.id === questionId);
    if (itemIndex >= 0) {
      setView("test");
      goToQuestion(itemIndex);
      return;
    }

    const nextSession = createSession({
      category: "Všetky témy",
      mode: "all",
      shuffle: false,
      misses: progress.misses,
    });
    const nextIndex = nextSession.items.findIndex((item) => item.id === questionId);

    setSelectedCategory("Všetky témy");
    setMode("all");
    setShuffle(false);
    setSession({
      ...nextSession,
      index: nextIndex >= 0 ? nextIndex : 0,
    });
    setView("test");
  }

  if (session.completed) {
    return (
      <main className="app-shell">
        <Results
          stats={sessionStats}
          missedIds={session.missedIds}
          onRestart={() => createAndApplySession()}
          onMisses={() => createAndApplySession({ mode: "misses" })}
          onReview={() => setView("bank")}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="control-panel" aria-label="Nastavenia testu">
        <div className="brand-block">
          <div className="brand-mark">
            <ListChecks size={22} aria-hidden="true" />
          </div>
          <div>
            <h1>PAM test</h1>
            <p>{questions.length} otázok z minuloročnej skúšky</p>
          </div>
        </div>

        <div className="score-strip" aria-label="Priebežné skóre">
          <div>
            <strong>{sessionStats.correctCount}</strong>
            <span>správne</span>
          </div>
          <div>
            <strong>{sessionStats.checkedCount}</strong>
            <span>skontrolované</span>
          </div>
          <div>
            <strong>{sessionStats.total}</strong>
            <span>v teste</span>
          </div>
        </div>

        <label className="field-label" htmlFor="category">
          Téma
        </label>
        <select
          id="category"
          value={selectedCategory}
          onChange={(event) => createAndApplySession({ category: event.target.value })}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <div className="field-label">Režim</div>
        <div className="segmented" role="group" aria-label="Režim testu">
          <button
            type="button"
            className={mode === "all" ? "selected" : ""}
            onClick={() => createAndApplySession({ mode: "all" })}
          >
            <BookOpen size={16} aria-hidden="true" />
            Všetko
          </button>
          <button
            type="button"
            className={mode === "misses" ? "selected" : ""}
            onClick={() => createAndApplySession({ mode: "misses" })}
            disabled={progress.misses.length === 0}
          >
            <CircleAlert size={16} aria-hidden="true" />
            Chyby
          </button>
        </div>

        <label className="switch-row">
          <input
            type="checkbox"
            checked={shuffle}
            onChange={(event) => createAndApplySession({ shuffle: event.target.checked })}
          />
          <span>
            <Shuffle size={16} aria-hidden="true" />
            Miešať otázky
          </span>
        </label>

        <div className="view-toggle" role="group" aria-label="Zobrazenie">
          <button
            type="button"
            className={view === "test" ? "selected" : ""}
            onClick={() => setView("test")}
            data-testid="view-test"
          >
            Test
          </button>
          <button
            type="button"
            className={view === "bank" ? "selected" : ""}
            onClick={() => setView("bank")}
            data-testid="view-bank"
          >
            Banka otázok
          </button>
        </div>

        <button type="button" className="ghost-button" onClick={resetHistory}>
          <RotateCcw size={16} aria-hidden="true" />
          Vynulovať chyby
        </button>
      </aside>

      {view === "test" ? (
        <TestPanel
          question={currentQuestion}
          answer={answer}
          checked={checked}
          correct={correct}
          selfScore={selfScore}
          stats={sessionStats}
          index={session.index}
          total={session.items.length}
          onSelect={(value) => updateAnswer(currentQuestion.id, value)}
          onToggle={(value) => toggleMulti(currentQuestion.id, value)}
          onCheck={checkCurrent}
          onSelfScore={setOpenSelfScore}
          onPrevious={() => goToQuestion(session.index - 1)}
          onNext={() => goToQuestion(session.index + 1)}
          onFinish={finishSession}
        />
      ) : (
        <QuestionBank
          questions={filteredBank}
          query={query}
          onQuery={setQuery}
          onPractice={practiceQuestion}
        />
      )}
    </main>
  );
}

function createSession({ category, mode, shuffle, misses }) {
  let items = questions.filter((question) => {
    const categoryMatch = category === "Všetky témy" || question.category === category;
    const modeMatch = mode !== "misses" || misses.includes(question.id);
    return categoryMatch && modeMatch;
  });

  if (items.length === 0) {
    items = questions.filter((question) => category === "Všetky témy" || question.category === category);
  }

  return {
    items: shuffle ? shuffleItems(items) : items,
    index: 0,
    answers: {},
    checked: {},
    selfScores: {},
    completed: false,
    missedIds: [],
  };
}

function TestPanel({
  question,
  answer,
  checked,
  correct,
  selfScore,
  stats,
  index,
  total,
  onSelect,
  onToggle,
  onCheck,
  onSelfScore,
  onPrevious,
  onNext,
  onFinish,
}) {
  const progress = total ? ((index + 1) / total) * 100 : 0;
  const questionKind = getQuestionKind(question);
  const canCheck =
    questionKind === "open" ||
    (questionKind === "multi" && Array.isArray(answer) && answer.length > 0) ||
    (questionKind === "single" && answer !== undefined);

  if (!question) {
    return (
      <section className="workspace-panel empty-state">
        <h2>Žiadne otázky na precvičenie</h2>
        <p>Vyber inú tému alebo režim.</p>
      </section>
    );
  }

  return (
    <section className="workspace-panel" aria-label="Otázka">
      <div className="topbar">
        <div>
          <span className="meta-label">{question.category}</span>
          <h2>
            Otázka {index + 1} z {total}
          </h2>
        </div>
        <div className="percent-badge">{stats.percent}%</div>
      </div>

      <div className="progress-track" aria-label="Priebeh testu">
        <div style={{ width: `${progress}%` }} />
      </div>

      <article className="question-card" data-testid="question-card">
        <div className="question-kicker">
          <span>Q{question.id}</span>
          <span>{questionKind === "multi" ? "viac odpovedí" : questionKind === "open" ? "otvorená" : "jedna odpoveď"}</span>
        </div>
        <p className="question-text">{question.question}</p>

        {questionKind === "open" ? (
          <OpenAnswer
            question={question}
            answer={answer || ""}
            checked={checked}
            selfScore={selfScore}
            onChange={onSelect}
            onSelfScore={onSelfScore}
          />
        ) : (
          <OptionList
            question={question}
            selected={answer}
            checked={checked}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        )}

        {checked && questionKind !== "open" ? (
          <div className={`feedback ${correct ? "success" : "danger"}`} role="status">
            {correct ? <CheckCircle2 size={18} /> : <X size={18} />}
            {correct ? "Správne." : "Nie úplne. Pozri zvýraznené správne odpovede."}
          </div>
        ) : null}
      </article>

      <div className="action-row">
        <button type="button" className="secondary-button" onClick={onPrevious} disabled={index === 0}>
          <ArrowLeft size={18} aria-hidden="true" />
          Späť
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onCheck}
          disabled={!canCheck || checked}
          data-testid="check-answer"
        >
          <Check size={18} aria-hidden="true" />
          Skontrolovať
        </button>
        {index + 1 === total ? (
          <button type="button" className="finish-button" onClick={onFinish} data-testid="finish-test">
            <Trophy size={18} aria-hidden="true" />
            Vyhodnotiť
          </button>
        ) : (
          <button type="button" className="secondary-button" onClick={onNext} data-testid="next-question">
            Ďalej
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

function OptionList({ question, selected, checked, onSelect, onToggle }) {
  const correctIndexes = getCorrectIndexes(question);
  const questionKind = getQuestionKind(question);

  return (
    <div className="option-list">
      {question.options.map((option, index) => {
        const isSelected =
          questionKind === "multi" ? Array.isArray(selected) && selected.includes(index) : selected === index;
        const isCorrect = correctIndexes.includes(index);
        const stateClass = checked
          ? isCorrect
            ? "correct"
            : isSelected
              ? "incorrect"
              : ""
          : isSelected
            ? "chosen"
            : "";

        return (
          <label
            className={`option-row ${stateClass}`}
            key={`${question.id}-${option.text}`}
            data-testid={`option-${index}`}
          >
            <input
              type={questionKind === "multi" ? "checkbox" : "radio"}
              name={`question-${question.id}`}
              checked={Boolean(isSelected)}
              onChange={() => (questionKind === "multi" ? onToggle(index) : onSelect(index))}
              disabled={checked}
            />
            <span className="option-control" aria-hidden="true" />
            <span>{option.text}</span>
          </label>
        );
      })}
    </div>
  );
}

function OpenAnswer({ question, answer, checked, selfScore, onChange, onSelfScore }) {
  return (
    <div className="open-answer">
      <label className="field-label" htmlFor={`open-${question.id}`}>
        Tvoja odpoveď
      </label>
      <textarea
        id={`open-${question.id}`}
        value={answer}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Napíš vlastnými slovami, potom si ju porovnaj so vzorovou odpoveďou."
      />
      {checked ? (
        <div className="model-answer">
          <strong>Vzorová odpoveď</strong>
          <p>{question.answer}</p>
          <div className="self-score" role="group" aria-label="Sebahodnotenie odpovede">
            <button
              type="button"
              className={selfScore === "correct" ? "selected" : ""}
              onClick={() => onSelfScore("correct")}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              Mal som správne
            </button>
            <button
              type="button"
              className={selfScore === "wrong" ? "selected" : ""}
              onClick={() => onSelfScore("wrong")}
            >
              <CircleAlert size={16} aria-hidden="true" />
              Ešte zopakovať
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuestionBank({ questions, query, onQuery, onPractice }) {
  return (
    <section className="workspace-panel" aria-label="Banka otázok">
      <div className="topbar">
        <div>
          <span className="meta-label">Prehľad</span>
          <h2>Banka otázok</h2>
        </div>
        <div className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Hľadať otázku alebo odpoveď"
            aria-label="Hľadať otázku alebo odpoveď"
            data-testid="bank-search"
          />
        </div>
      </div>
      <div className="bank-list">
        {questions.map((question) => (
          <details className="bank-item" key={question.id} data-testid={`bank-item-${question.id}`}>
            <summary>
              <span>Q{question.id}</span>
              {question.question}
            </summary>
            <div className="bank-answer">
              {question.type === "open" ? (
                <p>{question.answer}</p>
              ) : (
                <ul>
                  {question.options
                    .filter((option) => option.correct)
                    .map((option) => (
                      <li key={option.text}>{option.text}</li>
                    ))}
                </ul>
              )}
              <button type="button" className="secondary-button compact" onClick={() => onPractice(question.id)}>
                Precvičiť túto otázku
              </button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function Results({ stats, missedIds, onRestart, onMisses, onReview }) {
  return (
    <section className="results-panel">
      <div className="results-mark">
        <Trophy size={34} aria-hidden="true" />
      </div>
      <h1>Vyhodnotenie testu</h1>
      <p>
        Máš {stats.correctCount} správne z {stats.total}. To je {stats.percent}%.
      </p>
      <div className="results-grid">
        <div>
          <strong>{stats.correctCount}</strong>
          <span>správne</span>
        </div>
        <div>
          <strong>{missedIds.length}</strong>
          <span>na zopakovanie</span>
        </div>
        <div>
          <strong>{stats.percent}%</strong>
          <span>úspešnosť</span>
        </div>
      </div>
      <div className="action-row centered">
        <button type="button" className="primary-button" onClick={onRestart}>
          <RotateCcw size={18} aria-hidden="true" />
          Nový test
        </button>
        <button type="button" className="secondary-button" onClick={onMisses} disabled={missedIds.length === 0}>
          <CircleAlert size={18} aria-hidden="true" />
          Len chyby
        </button>
        <button type="button" className="secondary-button" onClick={onReview}>
          <BookOpen size={18} aria-hidden="true" />
          Prehľad odpovedí
        </button>
      </div>
    </section>
  );
}

export default App;
