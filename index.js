import { Command } from 'commander';
import fs from 'fs';

// Створюю головний об'єкт CLI-програми через commander
const program = new Command();

// Задаю базову інфу про утиліту: назву команди, що вона робить та версію
// Також додаю опцію -f/--file, щоб можна було підсунути інший JSON,
// а якщо користувач нічого не вказав — за замовчуванням береться мій data.json
program
  .name('schedule-cli')
  .description('CLI-програма для перегляду та фільтрації розкладу занять')
  .version('1.0.0')
  .option('-f, --file <path>', 'шлях до JSON-файлу розкладу', 'data.json');

// Спільна функція для читання JSON.
// Тут же ловлю типові помилки (немає файлу чи кривий синтаксис JSON)і вихід з кодом 1.
function loadData() {
  const filePath = program.opts().file; // витягується переданий шлях або дефолтний 'data.json'
  try {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(rawContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Помилка: Файл за шляхом "${filePath}" не знайдено.`);
    } else if (error instanceof SyntaxError) {
      console.error(`Помилка: Файл "${filePath}" містить некоректний JSON.`);
    } else {
      console.error(`Помилка читання файлу: ${error.message}`);
    }
    process.exit(1); // обов'язково ненульовий код при помилці
  }
}

// Загальні можливості 

// 1. Команда "list" — стислий список усіх пар.
// Має опцію зі значенням --limit, щоб вивести, наприклад, тільки перші 2-3 пари.
program
  .command('list')
  .description('Показати стислий список занять із можливістю обмежити кількість')
  .option('-l, --limit <number>', 'максимальна кількість занять для виводу')
  .action((options) => {
    const data = loadData();
    let lessons = data.lessons;

    // Якщо вказали ліміт — перевіряється, чи це нормальне додатне число, а не текст чи мінус
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit <= 0) {
        console.error('Помилка: Значення опції --limit має бути додатним цілим числом.');
        process.exit(1);
      }
      // Обрізається масив до потрібної кількості елементів
      lessons = lessons.slice(0, limit);
    }

    console.log(`--- Розклад занять групи ${data.group} (Семестр ${data.semester}) ---`);
    lessons.forEach((l) => {
      console.log(`[${l.id}] ${l.subject} (${l.day}, ${l.week})`);
    });
  });

// 2. Команда "get" — виводить взагалі всі дані про одну пару за її id.
// <id> в кутових дужках означає, що аргумент обов'язковий.
program
  .command('get <id>')
  .description('Показати повні відомості про окреме заняття за його ID')
  .action((id) => {
    const data = loadData();
    // Шукаю пару в масиві по id
    const lesson = data.lessons.find((item) => item.id === id);

    if (!lesson) {
      console.error(`Помилка: Заняття з ID "${id}" не знайдено.`);
      process.exit(1);
    }

    // Виводжу всі поля, включно з вкладеними об'єктами
    console.log(`Відомості про заняття ${lesson.id}:`);
    console.log(`  Предмет:    ${lesson.subject}`);
    console.log(`  День тижня: ${lesson.day}`);
    console.log(`  Тиждень:    ${lesson.week}`);
    console.log(`  Формат:     ${lesson.isOnline ? 'Дистанційно' : 'Очно'}`);
    console.log(`  Аудиторія:  ${lesson.room}`);
    console.log(`  Викладач:   ${lesson.teacher.name} (${lesson.teacher.department})`);
  });

// 3. Команда "field" — дістає конкретне поле пари.
// Працює навіть із вкладеними полями через крапку (наприклад: teacher.name або teacher.department).
program
  .command('field <id> <fieldPath>')
  .description('Показати значення окремого (зокрема вкладеного через крапку) поля')
  .action((id, fieldPath) => {
    const data = loadData();
    const lesson = data.lessons.find((item) => item.id === id);

    if (!lesson) {
      console.error(`Помилка: Заняття з ID "${id}" не знайдено.`);
      process.exit(1);
    }

    // Розбиваю шлях "teacher.name" на масив ключів: ['teacher', 'name']
    const segments = fieldPath.split('.');
    let current = lesson;

    // По черзі заходжу всередину об'єкта
    for (const key of segments) {
      if (current === null || current === undefined || !(key in current)) {
        console.error(`Помилка: Поле "${fieldPath}" відсутнє у занятті "${id}".`);
        process.exit(1);
      }
      current = current[key];
    }

    // Окремо обробляю null, щоб відрізнити "значення null" від "поля взагалі не існує"
    if (current === null) {
      console.log('Поле присутнє, але його значення: null');
    } else {
      console.log(current);
    }
  });

// Розклад занять

// 4. Команда "day" — фільтрує всі заняття за потрібним днем тижня (monday, tuesday тощо)
program
  .command('day <dayName>')
  .description('Показати заняття за обраний день тижня (monday, tuesday, wednesday тощо)')
  .action((dayName) => {
    const data = loadData();
    const targetDay = dayName.toLowerCase();
    // Відбираю пари, де збігається день
    const matched = data.lessons.filter((l) => l.day.toLowerCase() === targetDay);

    if (matched.length === 0) {
      console.error(`Помилка: Занять для дня "${dayName}" не знайдено.`);
      process.exit(1);
    }

    console.log(`Заняття на ${dayName}:`);
    matched.forEach((l) => {
      console.log(`- ${l.subject} [${l.week}], ауд./посилання: ${l.room} (${l.teacher.name})`);
    });
  });

// 5. Команда "teacher" — пошук пар конкретного викладача.
// Додатково реалізувада прапорець (boolean flag) -o/--online-only:
// якщо він є — відфільтрує суто дистанційні пари цього викладача.
program
  .command('teacher <teacherName>')
  .description('Показати заняття певного викладача (пошук за прізвищем або частиною імені)')
  .option('-o, --online-only', 'показати лише дистанційні заняття')
  .action((teacherName, options) => {
    const data = loadData();
    const query = teacherName.toLowerCase();
    
    // Шукається через includes, щоб можна було ввести просто прізвище"
    let matched = data.lessons.filter((l) =>
      l.teacher.name.toLowerCase().includes(query)
    );

    if (matched.length === 0) {
      console.error(`Помилка: Занять для викладача "${teacherName}" не знайдено.`);
      process.exit(1);
    }

    // Якщо користувач додав прапорець --online-only, залишаю тільки пари в зумі/міті
    if (options.onlineOnly) {
      matched = matched.filter((l) => l.isOnline === true);
      if (matched.length === 0) {
        console.log(`Викладач "${teacherName}" не має дистанційних занять.`);
        return;
      }
    }

    console.log(`Розклад викладача (${teacherName})${options.onlineOnly ? ' [лише онлайн]' : ''}:`);
    matched.forEach((l) => {
      console.log(`- [${l.day}] ${l.subject}: ${l.isOnline ? 'Дистанційно' : 'Очно'}, ${l.room}`);
    });
  });

// 6. Команда "week" — виводить розклад для чисельника чи знаменника.
// Обов'язково підтягуюються пари, які проходять щотижня ('weekly').
program
  .command('week <type>')
  .description('Показати розклад для чисельника (numerator) або знаменника (denominator)')
  .action((type) => {
    const weekType = type.toLowerCase();
    
    // Перевіряю валідність введеного типу тижня
    if (weekType !== 'numerator' && weekType !== 'denominator') {
      console.error('Помилка: Тип тижня має бути "numerator" (чисельник) або "denominator" (знаменник).');
      process.exit(1);
    }

    const data = loadData();
    // Залишаю пари для вказаного тижня + ті, що відбуваються щотижня
    const schedule = data.lessons.filter(
      (l) => l.week === weekType || l.week === 'weekly'
    );

    console.log(`Розклад на тиждень: ${weekType} (разом із щотижневими):`);
    schedule.forEach((l) => {
      const tag = l.week === 'weekly' ? 'щотижня' : l.week;
      console.log(`- [${l.day}] ${l.subject} (${tag}), ${l.room}`);
    });
  });

// Передаю в commander аргументи командного рядка для запуску потрібної команди
program.parse(process.argv);