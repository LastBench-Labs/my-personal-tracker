
/* My Personal Tracker — app.js
 * Offline-first, local-only tracker.
 * Data is stored in browser localStorage.
 */
'use strict';

const KEY = 'mpt.data.v1';
const $ = selector => document.querySelector(selector);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIM = { name: 120, note: 2000, cat: 60, desc: 200 };
const MAX_FILE = 2 * 1024 * 1024;
const MAX_AMT = 1e9;

const uid = () => 'i' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[ch]);

const pad = n => String(n).padStart(2, '0');

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const isDate = value => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;

  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return y >= 1970 && y <= 2200 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
};

const dayNum = date => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
};

const dayStr = number => new Date(number * 864e5).toISOString().slice(0, 10);

const cents = amount => Math.round(Number(amount) * 100);

const inr = amount =>
  (amount < 0 ? '-' : '') +
  '₹' +
  Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const pct = (done, total) => total ? Math.round(done / total * 100) : 0;

const mkTopics = (names, done) =>
  names.map(name => ({ id: uid(), name, done }));

const mkSub = (name, topics = []) => ({
  id: uid(),
  name,
  topics,
  notes: {}
});

/* ---------- starter data ---------- */

function seed() {
  const makeSemester = (name, subjects) => ({
    id: uid(),
    name,
    subjects: subjects.map(item =>
      typeof item === 'string' ? mkSub(item) : item
    )
  });

  const daa = mkSub('Design and Analysis of Algorithms (DAA)', [
    ...mkTopics([
      'Complexity analysis',
      'Recurrences',
      'Divide and conquer',
      'Sorting',
      'Searching',
      'Hashing',
      'DP fundamentals',
      'Matrix Chain Multiplication',
      'LCS'
    ], true),
    ...mkTopics(['0/1 Knapsack'], false)
  ]);

  const java = mkSub('Java', [
    ...mkTopics([
      'Core Java / OOP',
      'Strings and exception handling',
      'JDBC'
    ], true),
    ...mkTopics([
      'Event handling',
      'Swing'
    ], false)
  ]);

  const semesters = [
    makeSemester('5th Semester', [
      daa,
      'Artificial Intelligence',
      'Software Engineering',
      'Theory of Computation (TOC)',
      java
    ]),

    makeSemester('6th Semester', [
      'Machine Learning',
      'Cloud Computing',
      'Big Data Analytics',
      'Professional Elective Course 2 (offering to be confirmed)',
      'Mobile Application Development',
      'Associated Labs',
      'Functional English III',
      'Engineering Aptitude III'
    ]),

    makeSemester('7th Semester', [
      'Data Science',
      'Professional Elective Course 3',
      'Professional Elective Course 4',
      'Open Elective',
      'Data Science Lab',
      'Major Project Lab',
      'Industrial Training'
    ]),

    makeSemester('8th Semester', [
      'Subject 1 (rename me)'
    ])
  ];

  const exercises = [
    'Decline push-ups',
    'Normal push-ups',
    'Incline push-ups',
    'Diamond push-ups',
    'Dips',
    'Pike push-ups',
    'Shoulder taps',
    'Biceps curls',
    'Superman/back exercise',
    'Inverted row',
    'Reverse snow angel',
    'Plank',
    'Bicycle crunches',
    'Leg raises',
    'Squats',
    'Calf raises',
    'Wrist curls',
    'Hand gripper'
  ].map(name => ({ id: uid(), name }));

  return {
    version: 1,
    selSem: semesters[0].id,
    cycleStart: todayStr(),
    semesters,
    exercises,
    workoutDays: {},
    transactions: []
  };
}

/* ---------- data validation ---------- */

function valid(data) {
  const isArray = Array.isArray;

  const isObject = value =>
    value !== null &&
    typeof value === 'object' &&
    !isArray(value);

  const isString = (value, max, min = 0) =>
    typeof value === 'string' &&
    value.length >= min &&
    value.length <= max &&
    (min === 0 || value.trim().length > 0);

  const seen = {
    semesters: new Set(),
    subjects: new Set(),
    topics: new Set(),
    exercises: new Set(),
    transactions: new Set()
  };

  const checkId = (group, id) => {
    if (typeof id !== 'string' || !ID_RE.test(id)) {
      return 'An ID is malformed.';
    }

    if (seen[group].has(id)) {
      return 'A duplicate ID was found.';
    }

    seen[group].add(id);
    return null;
  };

  if (!isObject(data)) return 'The file is not a backup object.';
  if (data.version !== 1) return 'Unsupported backup version.';

  if (
    !isArray(data.semesters) ||
    !isArray(data.exercises) ||
    !isArray(data.transactions) ||
    !isObject(data.workoutDays)
  ) {
    return 'A required section is missing.';
  }

  if (!data.semesters.length) {
    return 'At least one semester is required.';
  }

  if (
    data.cycleStart !== undefined &&
    !isDate(data.cycleStart)
  ) {
    return 'The cycle start date is invalid.';
  }

  let error;

  for (const semester of data.semesters) {
    if (!isObject(semester)) return 'A semester is malformed.';

    error = checkId('semesters', semester.id);
    if (error) return error;

    if (
      !isString(semester.name, LIM.name, 1) ||
      !isArray(semester.subjects)
    ) {
      return 'A semester is malformed.';
    }

    for (const subject of semester.subjects) {
      if (!isObject(subject)) return 'A subject is malformed.';

      error = checkId('subjects', subject.id);
      if (error) return error;

      if (
        !isString(subject.name, LIM.name, 1) ||
        !isArray(subject.topics)
      ) {
        return 'A subject is malformed.';
      }

      if (subject.notes !== undefined) {
        if (!isObject(subject.notes)) {
          return 'Subject notes are malformed.';
        }

        for (const [date, note] of Object.entries(subject.notes)) {
          if (!isDate(date) || !isString(note, LIM.note)) {
            return 'A subject note is malformed.';
          }
        }
      }

      for (const topic of subject.topics) {
        if (!isObject(topic)) return 'A topic is malformed.';

        error = checkId('topics', topic.id);
        if (error) return error;

        if (
          !isString(topic.name, LIM.name, 1) ||
          typeof topic.done !== 'boolean'
        ) {
          return 'A topic is malformed.';
        }
      }
    }
  }

  if (
    typeof data.selSem !== 'string' ||
    !seen.semesters.has(data.selSem)
  ) {
    return 'The selected semester does not exist.';
  }

  for (const exercise of data.exercises) {
    if (!isObject(exercise)) return 'An exercise is malformed.';

    error = checkId('exercises', exercise.id);
    if (error) return error;

    if (!isString(exercise.name, LIM.name, 1)) {
      return 'An exercise is malformed.';
    }
  }

  for (const [date, record] of Object.entries(data.workoutDays)) {
    if (
      !isDate(date) ||
      !isObject(record) ||
      !isObject(record.done)
    ) {
      return 'A workout record is malformed.';
    }

    if (
      record.cycle !== undefined &&
      !(
        Number.isInteger(record.cycle) &&
        record.cycle >= 1 &&
        record.cycle <= 7
      )
    ) {
      return 'A workout cycle value is invalid.';
    }

    for (const [exerciseId, checked] of Object.entries(record.done)) {
      if (
        !ID_RE.test(exerciseId) ||
        typeof checked !== 'boolean'
      ) {
        return 'A workout checklist is malformed.';
      }
    }

    if (
      record.rec !== undefined &&
      !(
        isArray(record.rec) &&
        record.rec.length === 3 &&
        record.rec.every(value => typeof value === 'boolean')
      )
    ) {
      return 'Recovery check-ins are malformed.';
    }

    if (
      record.note !== undefined &&
      !isString(record.note, LIM.note)
    ) {
      return 'A workout note is malformed.';
    }
  }

  for (const transaction of data.transactions) {
    if (!isObject(transaction)) {
      return 'A transaction is malformed.';
    }

    error = checkId('transactions', transaction.id);
    if (error) return error;

    if (
      !isDate(transaction.date) ||
      !['received', 'spent', 'saved'].includes(transaction.type)
    ) {
      return 'A transaction date or type is invalid.';
    }

    if (
      typeof transaction.amount !== 'number' ||
      !Number.isFinite(transaction.amount) ||
      transaction.amount <= 0 ||
      transaction.amount > MAX_AMT ||
      Math.abs(
        transaction.amount * 100 -
        Math.round(transaction.amount * 100)
      ) > 1e-6
    ) {
      return 'A transaction amount is invalid.';
    }

    if (
      !isString(transaction.category, LIM.cat, 1) ||
      (
        transaction.description !== undefined &&
        !isString(transaction.description, LIM.desc)
      )
    ) {
      return 'A transaction category or description is invalid.';
    }
  }

  return null;
}

/* Support older version-1 data that did not contain cycleStart. */
function normalize(data) {
  if (data.cycleStart) return false;

  const dates = Object.keys(data.workoutDays)
    .filter(date => data.workoutDays[date].cycle)
    .sort();

  const lastDate = dates.pop();

  data.cycleStart = lastDate
    ? dayStr(
        dayNum(lastDate) -
        (data.workoutDays[lastDate].cycle - 1)
      )
    : todayStr();

  return true;
}

/* ---------- application state and storage ---------- */

let D = null;
let recovery = null;
let storageWarn = '';
let view = 'home';
let mDate = todayStr();
let wDate = todayStr();
let editTx = null;
let toastTimer;
let noteTimer;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(D));
    return true;
  } catch (error) {
    console.error('Save failed:', error);
    return false;
  }
}

function load() {
  let raw;

  try {
    raw = localStorage.getItem(KEY);
  } catch (error) {
    storageWarn = 'Browser storage is unavailable. Changes cannot be saved.';
    D = seed();
    return;
  }

  if (raw === null) {
    D = seed();

    if (!save()) {
      storageWarn =
        'Browser storage is blocked or full. Changes cannot be saved.';
    }

    return;
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    recovery = {
      reason: 'The stored data is not readable JSON.',
      raw
    };
    return;
  }

  const error = valid(data);

  if (error) {
    recovery = {
      reason: 'The stored data failed validation: ' + error,
      raw
    };
    return;
  }

  const changed = normalize(data);
  D = data;

  if (changed && !save()) {
    storageWarn =
      'Your data loaded, but an update to its saved format could not be stored. Export a backup and check browser storage.';
  }
}

function toast(message, isError = false) {
  const element = $('#toast');
  if (!element) return;

  element.textContent = message;
  element.className = isError ? 'err' : '';
  element.style.display = 'block';

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.style.display = 'none';
  }, isError ? 7000 : 2500);
}

const fail = message => {
  toast(message, true);
  return false;
};

function render() {
  document.querySelectorAll('nav a').forEach(link => {
    link.classList.toggle('on', link.hash === '#' + view);
  });

  const app = $('#app');
  if (!app) return;

  if (recovery) {
    app.innerHTML = recoveryView();
    return;
  }

  app.innerHTML =
    (storageWarn
      ? `<div class="warn">${esc(storageWarn)}</div>`
      : '') +
    (V[view] || V.home)();
}

/*
 * Apply a change and save it.
 * If persistence fails, restore the previous in-memory data.
 */
function commit(mutate, successMessage, options = {}) {
  if (!D || recovery) return false;

  const snapshot = JSON.stringify(D);

  try {
    const result = mutate();

    if (result === false) {
      D = JSON.parse(snapshot);
      if (!options.keep) render();
      return false;
    }

    if (!save()) {
      D = JSON.parse(snapshot);

      toast(
        'NOT SAVED: browser storage is full or blocked. Your change was undone. Export a backup and check storage.',
        true
      );

      render();
      return false;
    }

    const hadWarning = Boolean(storageWarn);
    storageWarn = '';

    if (successMessage) toast(successMessage);

    if (!options.keep || hadWarning) render();

    return true;
  } catch (error) {
    console.error('Change failed:', error);
    D = JSON.parse(snapshot);

    toast('Something went wrong. Nothing was changed.', true);
    render();

    return false;
  }
}

/* ---------- helpers ---------- */

const sem = () =>
  D.semesters.find(item => item.id === D.selSem) || D.semesters[0];

const findJ = id => {
  for (const semester of D.semesters) {
    const subject = semester.subjects.find(item => item.id === id);
    if (subject) return subject;
  }
};

const cycleDay = date =>
  (((dayNum(date) - dayNum(D.cycleStart)) % 7) + 7) % 7 + 1;

const wrec = date => {
  if (!D.workoutDays[date]) {
    D.workoutDays[date] = {
      done: {},
      rec: [false, false, false],
      note: ''
    };
  }

  if (!D.workoutDays[date].rec) {
    D.workoutDays[date].rec = [false, false, false];
  }

  return D.workoutDays[date];
};

function totals(date) {
  const total = {
    received: 0,
    spent: 0,
    saved: 0
  };

  for (const transaction of D.transactions) {
    if (transaction.date === date) {
      total[transaction.type] += cents(transaction.amount);
    }
  }

  return {
    received: total.received / 100,
    spent: total.spent / 100,
    saved: total.saved / 100,
    remaining:
      (total.received - total.spent - total.saved) / 100
  };
}

const savings = () =>
  D.transactions.reduce(
    (sum, item) =>
      item.type === 'saved'
        ? sum + cents(item.amount)
        : sum,
    0
  ) / 100;

const semStats = semester => {
  let done = 0;
  let total = 0;

  semester.subjects.forEach(subject => {
    total += subject.topics.length;
    done += subject.topics.filter(topic => topic.done).length;
  });

  return {
    done,
    total,
    percent: pct(done, total)
  };
};

const bar = percent =>
  `<div class="bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent}%"></i></div>`;

function ask(message, current = '') {
  const answer = prompt(message, current);

  if (answer === null) return null;

  const value = answer.trim();

  if (!value) {
    toast('Name cannot be empty.', true);
    return null;
  }

  if (value.length > LIM.name) {
    toast(`Name is too long (max ${LIM.name} characters).`, true);
    return null;
  }

  return value;
}

function download(content, filename, type) {
  const url = URL.createObjectURL(
    new Blob([content], { type })
  );

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- screens ---------- */

const openJ = new Set();
const V = {};

V.home = () => {
  const semester = sem();
  const stats = semStats(semester);
  const today = todayStr();
  const cycle = cycleDay(today);
  const record = D.workoutDays[today];
  const money = totals(today);
  const rest = cycle >= 6;

  const done = record
    ? D.exercises.filter(item => record.done[item.id]).length
    : 0;

  let next = '';

  for (const subject of semester.subjects) {
    const topic = subject.topics.find(item => !item.done);

    if (topic) {
      next = `Next study step: ${topic.name} (${subject.name}).`;
      break;
    }
  }

  if (!next) {
    next = stats.total
      ? 'Every topic in this semester is complete. Pick another semester or add topics.'
      : 'Add topics to your subjects in College to start tracking progress.';
  }

  next += rest
    ? ' Today is a rest day: recover well.'
    : (
      done < D.exercises.length
        ? ' A workout is waiting whenever you feel ready.'
        : ''
    );

  return `
    <div class="card">
      <div class="muted">${esc(semester.name)}</div>
      ${
        stats.total
          ? `
            <div class="big">${stats.percent}% of topics complete</div>
            ${bar(stats.percent)}
            <div class="muted">${stats.done} of ${stats.total} topics</div>
          `
          : `
            <div class="big">No topics yet</div>
            <div class="muted">Add topics in College to see progress.</div>
          `
      }
    </div>

    <div class="card">
      <div class="muted">Today’s workout (cycle day ${cycle})</div>
      ${
        rest
          ? '<div class="big">Rest day</div>'
          : `
            <div class="big">${done}/${D.exercises.length} exercises</div>
            ${bar(pct(done, D.exercises.length))}
          `
      }
    </div>

    <div class="grid">
      <div class="card">
        <div class="muted">Remaining today</div>
        <div class="big">${inr(money.remaining)}</div>
      </div>

      <div class="card">
        <div class="muted">Total recorded savings</div>
        <div class="big">${inr(savings())}</div>
      </div>
    </div>

    <div class="note">${esc(next)}</div>
  `;
};

V.college = () => {
  const semester = sem();
  const stats = semStats(semester);
  const today = todayStr();

  return `
    <div class="card">
      <select id="semSel" aria-label="Semester">
        ${D.semesters.map(item => `
          <option value="${item.id}" ${item.id === semester.id ? 'selected' : ''}>
            ${esc(item.name)}
          </option>
        `).join('')}
      </select>

      <div class="flex" style="margin-top:.5rem">
        <button class="s" data-a="addSem">Add semester</button>
        <button class="s" data-a="renSem">Rename</button>
        <button class="d" data-a="delSem">Delete</button>
      </div>

      ${
        stats.total
          ? `
            <div class="big">${stats.percent}%</div>
            ${bar(stats.percent)}
            <div class="muted">${stats.done} of ${stats.total} topics complete</div>
          `
          : '<p class="muted">No topics added yet, so there is no progress to show.</p>'
      }
    </div>

    ${
      semester.subjects.map(subject => {
        const done = subject.topics.filter(topic => topic.done).length;

        return `
          <details data-j="${subject.id}" ${openJ.has(subject.id) ? 'open' : ''}>
            <summary>
              ${esc(subject.name)}
              <span class="muted">
                ${
                  subject.topics.length
                    ? `${done}/${subject.topics.length} · ${pct(done, subject.topics.length)}%`
                    : 'no topics yet'
                }
              </span>
            </summary>

            ${
              subject.topics.map(topic => `
                <div class="flex sp">
                  <label class="row ${topic.done ? 'done' : ''}" style="flex:1">
                    <input
                      type="checkbox"
                      data-a="tog"
                      data-j="${subject.id}"
                      data-t="${topic.id}"
                      ${topic.done ? 'checked' : ''}
                    >
                    <span>${esc(topic.name)}</span>
                  </label>

                  <button
                    class="s i"
                    data-a="renT"
                    data-j="${subject.id}"
                    data-t="${topic.id}"
                    aria-label="Rename topic"
                  >Edit</button>

                  <button
                    class="d i"
                    data-a="delT"
                    data-j="${subject.id}"
                    data-t="${topic.id}"
                    aria-label="Delete topic"
                  >✕</button>
                </div>
              `).join('')
            }

            <div class="flex" style="margin:.5rem 0">
              <button data-a="addT" data-j="${subject.id}">Add topic</button>
              <button class="s" data-a="renJ" data-j="${subject.id}">Rename subject</button>
              <button class="d" data-a="delJ" data-j="${subject.id}">Delete subject</button>
            </div>

            <label class="muted" for="n${subject.id}">
              Note for today: what I covered and what is next
            </label>

            <textarea
              id="n${subject.id}"
              data-a="jnote"
              data-j="${subject.id}"
              data-d="${today}"
              maxlength="${LIM.note}"
              rows="3"
            >${esc(subject.notes?.[today] || '')}</textarea>
          </details>
        `;
      }).join('') ||
      '<p class="muted">No subjects yet. Add the first one below.</p>'
    }

    <button data-a="addJ">Add subject</button>
  `;
};

V.workout = () => {
  const record = D.workoutDays[wDate];
  const cycle = cycleDay(wDate);
  const rest = cycle >= 6;
  const recoveryChecks = record?.rec || [false, false, false];

  const done = record
    ? D.exercises.filter(item => record.done[item.id]).length
    : 0;

  return `
    <div class="card">
      <div class="grid">
        <div>
          <label class="muted" for="wd">Date</label>
          <input type="date" id="wd" value="${wDate}">
        </div>

        <div>
          <label class="muted" for="wc">Cycle day</label>
          <select id="wc">
            ${
              [1, 2, 3, 4, 5, 6, 7].map(day => `
                <option value="${day}" ${day === cycle ? 'selected' : ''}>
                  Day ${day}${day > 5 ? ' (rest)' : ''}
                </option>
              `).join('')
            }
          </select>
        </div>
      </div>

      <p class="muted" style="margin-bottom:0">
        The cycle follows the calendar (Day 1 was ${esc(D.cycleStart)}).
        Changing the day here re-aligns the whole cycle.
      </p>
    </div>

    ${
      rest
        ? `
          <div class="note">
            <b>Rest and recovery day.</b>
            Hydrate, eat well, and sleep. Light walking or stretching is fine.
          </div>

          ${
            [
              'I feel well enough to train.',
              'I slept/recovered reasonably.',
              'I will stop if I feel unwell.'
            ].map((label, index) => `
              <label class="row">
                <input
                  type="checkbox"
                  data-a="rec"
                  data-i="${index}"
                  ${recoveryChecks[index] ? 'checked' : ''}
                >
                <span>${label}</span>
              </label>
            `).join('')
          }
        `
        : `
          <div class="card">
            <b>Workout: ${done}/${D.exercises.length}</b>
            ${bar(pct(done, D.exercises.length))}

            ${
              D.exercises.length
                ? D.exercises.map(exercise => `
                    <div class="flex sp">
                      <label
                        class="row ${record?.done[exercise.id] ? 'done' : ''}"
                        style="flex:1"
                      >
                        <input
                          type="checkbox"
                          data-a="ex"
                          data-e="${exercise.id}"
                          ${record?.done[exercise.id] ? 'checked' : ''}
                        >
                        <span>${esc(exercise.name)}</span>
                      </label>

                      <button
                        class="d i"
                        data-a="delEx"
                        data-e="${exercise.id}"
                        aria-label="Remove exercise"
                      >✕</button>
                    </div>
                  `).join('')
                : '<p class="muted">No exercises. Add one below.</p>'
            }

            <button class="s" data-a="addEx" style="margin-top:.5rem">
              Add exercise
            </button>
          </div>

          <div class="note">
            Missed a day? No reset. The cycle keeps following the calendar.
            If you feel weak, dizzy, or unwell, rest instead of pushing through.
          </div>
        `
    }

    <label class="muted" for="wn">Note for this date</label>
    <textarea
      id="wn"
      data-a="wnote"
      data-d="${wDate}"
      maxlength="${LIM.note}"
      rows="3"
    >${esc(record?.note || '')}</textarea>

    <div style="margin-top:.5rem">
      <button class="d" data-a="clrW">Clear checkboxes for this date</button>
    </div>
  `;
};

V.money = () => {
  const today = todayStr();
  const todayTotals = totals(today);

  const list = D.transactions
    .filter(item => item.date === mDate)
    .slice()
    .reverse();

  const editing = D.transactions.find(item => item.id === editTx);

  const categories = [
    'Pocket money',
    'Food',
    'Travel',
    'Study',
    'Personal',
    'Savings',
    'Other'
  ];

  return `
    <h2 style="margin-top:0">Today (${esc(today)})</h2>

    <div class="grid">
      <div class="card">
        <div class="muted">Received today</div>
        <div class="big rec">${inr(todayTotals.received)}</div>
      </div>

      <div class="card">
        <div class="muted">Spent today</div>
        <div class="big sp-c">${inr(todayTotals.spent)}</div>
      </div>

      <div class="card">
        <div class="muted">Saved today</div>
        <div class="big">${inr(todayTotals.saved)}</div>
      </div>

      <div class="card">
        <div class="muted">Remaining today</div>
        <div class="big">${inr(todayTotals.remaining)}</div>
      </div>
    </div>

    <div class="card" style="margin-top:.6rem">
      <div class="muted">Total recorded savings (all dates)</div>
      <div class="big">${inr(savings())}</div>
    </div>

    <h2>${editing ? 'Edit transaction' : 'Add transaction'}</h2>

    <div class="card">
      <div class="grid">
        <input
          type="date"
          id="td"
          value="${editing ? editing.date : today}"
          aria-label="Date"
        >

        <select id="tty" aria-label="Type">
          ${
            ['received', 'spent', 'saved'].map(type => `
              <option
                value="${type}"
                ${editing && editing.type === type ? 'selected' : ''}
              >${type}</option>
            `).join('')
          }
        </select>

        <input
          type="text"
          id="ta"
          inputmode="decimal"
          placeholder="Amount (₹)"
          value="${editing ? editing.amount : ''}"
          aria-label="Amount in rupees"
        >

        <input
          type="text"
          id="tc"
          list="cl"
          maxlength="${LIM.cat}"
          placeholder="Category"
          value="${esc(editing ? editing.category : '')}"
          aria-label="Category"
        >

        <datalist id="cl">
          ${categories.map(category => `<option value="${category}">`).join('')}
        </datalist>
      </div>

      <input
        type="text"
        id="tde"
        maxlength="${LIM.desc}"
        placeholder="Description (optional)"
        value="${esc(editing ? editing.description || '' : '')}"
        style="margin:.5rem 0"
        aria-label="Description"
      >

      <div class="flex">
        <button data-a="saveTx">
          ${editing ? 'Save changes' : 'Add transaction'}
        </button>
        ${editing ? '<button class="s" data-a="cancelTx">Cancel</button>' : ''}
      </div>
    </div>

    <h2>Transactions on a date</h2>

    <input
      type="date"
      id="md"
      value="${mDate}"
      aria-label="Show transactions for date"
    >

    <div class="card" style="margin-top:.5rem">
      ${
        list.length
          ? list.map(item => `
              <div class="tx">
                <div>
                  <b class="${
                    item.type === 'received'
                      ? 'rec'
                      : item.type === 'spent'
                        ? 'sp-c'
                        : ''
                  }">
                    ${esc(item.type)} ${inr(item.amount)}
                  </b>

                  <div class="muted">
                    ${esc(item.category)}
                    ${item.description ? ' · ' + esc(item.description) : ''}
                  </div>
                </div>

                <div class="flex">
                  <button class="s i" data-a="editTx" data-id="${item.id}">Edit</button>
                  <button class="d i" data-a="delTx" data-id="${item.id}" aria-label="Delete transaction">✕</button>
                </div>
              </div>
            `).join('')
          : '<p class="muted">No transactions on this date.</p>'
      }
    </div>
  `;
};

V.backup = () => `
  <div class="card">
    <h3>Export backup</h3>
    <p class="muted">
      Downloads all your data as a readable JSON file.
      It is not encrypted, so keep it private.
    </p>
    <button data-a="export">Export backup</button>
  </div>

  <div class="card">
    <h3>Restore backup</h3>
    <p class="muted">
      Restoring replaces all current data. A file that fails validation changes nothing.
    </p>
    <input type="file" id="imp" accept=".json,application/json" aria-label="Backup file">
  </div>

  <div class="card">
    <h3>Privacy</h3>
    <p class="muted">
      Your records stay on this device in browser storage. The app does not transmit them.
      Data can be lost if you clear site data, reset the browser, or lose the phone,
      so export a backup regularly.
    </p>
  </div>

  <div class="card">
    <h3>Reset tracker</h3>
    <p class="muted">
      Replaces current records with fresh starter data.
      This cannot be undone without a backup.
    </p>
    <button class="d" data-a="erase">Reset tracker to starter data</button>
  </div>
`;

function recoveryView() {
  return `
    <div class="warn">
      <h2 style="margin-top:0">Saved data needs attention</h2>
      <p>${esc(recovery.reason)}</p>
      <p class="muted">
        Your stored data has not been changed or deleted.
        Nothing new will be saved until you choose an option below.
      </p>

      ${
        recovery.raw
          ? '<button data-a="dlRaw">Download the stored data</button>'
          : ''
      }
    </div>

    <div class="card">
      <h3>Restore from a backup</h3>
      <input type="file" id="imp" accept=".json,application/json" aria-label="Backup file">
    </div>

    <div class="card">
      <h3>Reset to starter data</h3>
      <p class="muted">
        Starts fresh. Download the unreadable data first if you want to preserve a copy.
      </p>
      <button class="d" data-a="resetBad">Reset to starter data</button>
    </div>
  `;
}

/* ---------- navigation ---------- */

function route() {
  const hash = location.hash.slice(1);
  view = Object.hasOwn(V, hash) ? hash : 'home';

  render();
  window.scrollTo(0, 0);
}

addEventListener('hashchange', route);

document.addEventListener('toggle', event => {
  const id = event.target.dataset?.j;

  if (id && event.target.tagName === 'DETAILS') {
    if (event.target.open) openJ.add(id);
    else openJ.delete(id);
  }
}, true);

/* ---------- note autosave ---------- */

function saveNote(textarea, showMessage) {
  if (!D || recovery) return;

  const date = textarea.dataset.d;
  if (!isDate(date)) return;

  const value = textarea.value;

  if (textarea.dataset.a === 'wnote') {
    if ((D.workoutDays[date]?.note || '') === value) return;

    commit(
      () => { wrec(date).note = value; },
      showMessage ? 'Note saved.' : '',
      { keep: true }
    );

    return;
  }

  const current = findJ(textarea.dataset.j);

  if (!current || (current.notes?.[date] || '') === value) return;

  commit(() => {
    const subject = findJ(textarea.dataset.j);

    if (!subject) return fail('Subject not found.');

    subject.notes = subject.notes || {};

    if (value.trim()) {
      subject.notes[date] = value;
    } else {
      delete subject.notes[date];
    }
  }, showMessage ? 'Note saved.' : '', { keep: true });
}

document.addEventListener('input', event => {
  const target = event.target;

  if (
    !D ||
    (target.dataset.a !== 'jnote' && target.dataset.a !== 'wnote')
  ) {
    return;
  }

  clearTimeout(noteTimer);

  noteTimer = setTimeout(() => {
    saveNote(target, false);
  }, 800);
});

/* ---------- input changes ---------- */

document.addEventListener('change', event => {
  const target = event.target;
  const action = target.dataset.a;

  if (target.id === 'imp') {
    doImport(target);
    return;
  }

  if (!D || recovery) return;

  if (action === 'jnote' || action === 'wnote') {
    clearTimeout(noteTimer);
    saveNote(target, true);
    return;
  }

  if (target.id === 'semSel') {
    commit(() => {
      if (!D.semesters.some(item => item.id === target.value)) {
        return fail('Semester not found.');
      }

      D.selSem = target.value;
    });

    return;
  }

  if (target.id === 'wd') {
    if (isDate(target.value)) {
      wDate = target.value;
      render();
    } else {
      toast('Choose a valid date.', true);
      target.value = wDate;
    }

    return;
  }

  if (target.id === 'md') {
    if (isDate(target.value)) {
      mDate = target.value;
      render();
    } else {
      toast('Choose a valid date.', true);
      target.value = mDate;
    }

    return;
  }

  if (target.id === 'wc') {
    const day = Number(target.value);

    if (day === cycleDay(wDate)) return;

    if (!confirm(
      `Make ${wDate} cycle Day ${day}? The whole cycle re-aligns, so other dates change too. Your records are kept.`
    )) {
      render();
      return;
    }

    commit(() => {
      D.cycleStart = dayStr(dayNum(wDate) - (day - 1));
    }, 'Cycle updated.');

    return;
  }

  if (action === 'tog') {
    commit(() => {
      const topic = findJ(target.dataset.j)
        ?.topics.find(item => item.id === target.dataset.t);

      if (!topic) return fail('Topic not found.');

      topic.done = target.checked;
    });
  } else if (action === 'ex') {
    commit(() => {
      wrec(wDate).done[target.dataset.e] = target.checked;
    });
  } else if (action === 'rec') {
    const index = Number(target.dataset.i);

    if (index < 0 || index > 2) return;

    commit(() => {
      wrec(wDate).rec[index] = target.checked;
    });
  }
});

/* ---------- buttons ---------- */

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-a]');
  if (!button) return;

  const action = button.dataset.a;
  const ds = button.dataset;
  let name;

  if (action === 'dlRaw') {
    if (recovery?.raw) {
      download(
        recovery.raw,
        'personal-tracker-stored-data.txt',
        'text/plain'
      );
    }

    return;
  }

  if (action === 'resetBad') {
    const confirmed =
      confirm('Reset to starter data? Download the unreadable data first if you may need it.') &&
      prompt('Type RESET to confirm:') === 'RESET';

    if (!confirmed) {
      toast('Reset cancelled.');
      return;
    }

    stash();

    const oldData = D;
    D = seed();

    if (!save()) {
      D = oldData;
      toast('NOT RESET: could not write to browser storage.', true);
      return;
    }

    recovery = null;
    storageWarn = '';
    editTx = null;
    mDate = wDate = todayStr();
    openJ.clear();

    toast('Starter data restored.');
    render();
    return;
  }

  if (!D || recovery) return;

  switch (action) {
    case 'addSem':
      name = ask('New semester name:');

      if (name) {
        commit(() => {
          const item = { id: uid(), name, subjects: [] };
          D.semesters.push(item);
          D.selSem = item.id;
        }, 'Semester added.');
      }
      break;

    case 'renSem':
      name = ask('Rename semester:', sem().name);

      if (name) {
        commit(() => {
          sem().name = name;
        }, 'Renamed.');
      }
      break;

    case 'delSem': {
      if (D.semesters.length < 2) {
        toast('Keep at least one semester.', true);
        break;
      }

      const current = sem();

      if (confirm(`Delete "${current.name}" and all its subjects and topics?`)) {
        commit(() => {
          D.semesters = D.semesters.filter(item => item.id !== current.id);
          D.selSem = D.semesters[0].id;
        }, 'Semester deleted.');
      }

      break;
    }

    case 'addJ':
      name = ask('New subject name:');

      if (name) {
        commit(() => {
          sem().subjects.push(mkSub(name));
        }, 'Subject added.');
      }
      break;

    case 'renJ': {
      const subject = findJ(ds.j);

      if (!subject) {
        toast('Subject not found.', true);
        break;
      }

      name = ask('Rename subject:', subject.name);

      if (name) {
        commit(() => {
          const item = findJ(ds.j);

          if (!item) return fail('Subject not found.');

          item.name = name;
        }, 'Renamed.');
      }

      break;
    }

    case 'delJ': {
      const subject = findJ(ds.j);

      if (!subject) {
        toast('Subject not found.', true);
        break;
      }

      if (confirm(`Delete "${subject.name}" and its topics?`)) {
        commit(() => {
          for (const semester of D.semesters) {
            semester.subjects = semester.subjects.filter(
              item => item.id !== ds.j
            );
          }
        }, 'Subject deleted.');
      }

      break;
    }

    case 'addT':
      if (!findJ(ds.j)) {
        toast('Subject not found.', true);
        break;
      }

      name = ask('New topic name:');

      if (name) {
        openJ.add(ds.j);

        commit(() => {
          const subject = findJ(ds.j);

          if (!subject) return fail('Subject not found.');

          subject.topics.push({
            id: uid(),
            name,
            done: false
          });
        }, 'Topic added.');
      }
      break;

    case 'renT': {
      const topic = findJ(ds.j)
        ?.topics.find(item => item.id === ds.t);

      if (!topic) {
        toast('Topic not found.', true);
        break;
      }

      name = ask('Rename topic:', topic.name);

      if (name) {
        commit(() => {
          const item = findJ(ds.j)
            ?.topics.find(topicItem => topicItem.id === ds.t);

          if (!item) return fail('Topic not found.');

          item.name = name;
        }, 'Renamed.');
      }

      break;
    }

    case 'delT':
      if (confirm('Delete this topic?')) {
        commit(() => {
          const subject = findJ(ds.j);

          if (!subject) return fail('Subject not found.');

          subject.topics = subject.topics.filter(
            item => item.id !== ds.t
          );
        }, 'Topic deleted.');
      }
      break;

    case 'addEx':
      name = ask('New exercise name:');

      if (name) {
        commit(() => {
          D.exercises.push({ id: uid(), name });
        }, 'Exercise added.');
      }
      break;

    case 'delEx':
      if (confirm('Remove this exercise from the list? Past completion records are kept.')) {
        commit(() => {
          D.exercises = D.exercises.filter(item => item.id !== ds.e);
        }, 'Exercise removed.');
      }
      break;

    case 'clrW':
      if (
        D.workoutDays[wDate] &&
        confirm('Clear all checkboxes for this date only?')
      ) {
        commit(() => {
          const record = wrec(wDate);
          record.done = {};
          record.rec = [false, false, false];
        }, 'Cleared for this date.');
      }
      break;

    case 'saveTx': {
      const raw = $('#ta').value.trim().replace(/^₹/, '');
      const date = $('#td').value;
      const category = $('#tc').value.trim();
      const description = $('#tde').value.trim();
      const type = $('#tty').value;

      if (!isDate(date)) {
        toast('Choose a valid date.', true);
        break;
      }

      if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(Number(raw) > 0)) {
        toast(
          'Enter an amount above 0 with at most 2 decimals, for example 120 or 49.50.',
          true
        );
        break;
      }

      const amount = Math.round(Number(raw) * 100) / 100;

      if (!Number.isFinite(amount) || amount > MAX_AMT) {
        toast('Amount is too large or invalid.', true);
        break;
      }

      if (!['received', 'spent', 'saved'].includes(type)) {
        toast('Choose a valid transaction type.', true);
        break;
      }

      if (!category || category.length > LIM.cat) {
        toast('Enter a category of up to 60 characters.', true);
        break;
      }

      if (description.length > LIM.desc) {
        toast('Description is too long.', true);
        break;
      }

      const transaction = {
        date,
        type,
        amount,
        category,
        description
      };

      const id = editTx;

      const saved = commit(() => {
        if (id) {
          const current = D.transactions.find(item => item.id === id);

          if (!current) {
            return fail('That transaction no longer exists. Nothing was changed.');
          }

          Object.assign(current, transaction);
        } else {
          D.transactions.push({
            id: uid(),
            ...transaction
          });
        }
      }, 'Transaction saved.', { keep: true });

      if (saved) {
        editTx = null;
        mDate = date;
        render();
      }

      break;
    }

    case 'editTx':
      if (!D.transactions.some(item => item.id === ds.id)) {
        toast('Transaction not found.', true);
        break;
      }

      editTx = ds.id;
      render();
      window.scrollTo(0, 0);
      break;

    case 'cancelTx':
      editTx = null;
      render();
      break;

    case 'delTx':
      if (confirm('Delete this transaction?')) {
        const deleted = commit(() => {
          if (!D.transactions.some(item => item.id === ds.id)) {
            return fail('Transaction not found.');
          }

          D.transactions = D.transactions.filter(
            item => item.id !== ds.id
          );
        }, 'Transaction deleted.', { keep: true });

        if (deleted) {
          if (editTx === ds.id) editTx = null;
          render();
        }
      }
      break;

    case 'export':
      download(
        JSON.stringify(D, null, 2),
        `personal-tracker-backup-${todayStr()}.json`,
        'application/json'
      );

      toast('Backup downloaded. Keep it private.');
      break;

    case 'erase': {
      const confirmed =
        confirm('Replace all current tracker records with fresh starter data? This cannot be undone without a backup.') &&
        prompt('Type RESET to confirm:') === 'RESET';

      if (!confirmed) {
        toast('Reset cancelled.');
        break;
      }

      const oldData = D;
      D = seed();

      if (!save()) {
        D = oldData;
        toast('NOT RESET: could not write to browser storage.', true);
        break;
      }

      storageWarn = '';
      recovery = null;
      editTx = null;
      mDate = wDate = todayStr();
      openJ.clear();

      toast('Tracker reset to starter data.');
      render();
      break;
    }
  }
});

/* ---------- recovery and backup import ---------- */

function stash() {
  if (!recovery?.raw) return;

  try {
    localStorage.setItem(
      KEY + '.unreadable.' + Date.now(),
      recovery.raw
    );
  } catch (error) {
    console.warn(
      'Could not stash unreadable data; download it before resetting if possible.',
      error
    );
  }
}

function doImport(input) {
  const file = input.files?.[0];
  if (!file) return;

  const resetInput = () => {
    input.value = '';
  };

  if (file.size > MAX_FILE) {
    resetInput();
    toast('File is too large (max 2 MB). Nothing was changed.', true);
    return;
  }

  const reader = new FileReader();

  reader.onerror = () => {
    resetInput();
    toast('Could not read that file. Nothing was changed.', true);
  };

  reader.onload = () => {
    let data;

    try {
      data = JSON.parse(reader.result);
    } catch (error) {
      resetInput();
      toast('That file is not valid JSON. Nothing was changed.', true);
      return;
    }

    const error = valid(data);

    if (error) {
      resetInput();
      toast('Invalid backup: ' + error + ' Nothing was changed.', true);
      return;
    }

    if (!confirm('Restoring replaces ALL current data with this backup. Continue?')) {
      resetInput();
      toast('Restore cancelled.');
      return;
    }

    normalize(data);

    const oldData = D;
    stash();
    D = data;

    if (!save()) {
      D = oldData;
      resetInput();

      toast(
        'NOT RESTORED: could not write to browser storage. Current data is unchanged.',
        true
      );

      return;
    }

    recovery = null;
    storageWarn = '';
    editTx = null;
    mDate = wDate = todayStr();
    openJ.clear();

    resetInput();
    toast('Backup restored.');
    render();
  };

  reader.readAsText(file);
}

/* ---------- startup ---------- */

load();
route();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        toast('App updated. Reload to use the new version.');
      }
    });

    navigator.serviceWorker.register('sw.js').catch(error => {
      console.error('Service worker registration failed:', error);
      toast(
        'Offline mode is unavailable: the service worker could not start.',
        true
      );
    });
  });
}
