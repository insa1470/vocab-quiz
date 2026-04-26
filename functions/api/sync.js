// GET  /api/sync?userId=X  → { weak, streak }
// POST /api/sync           body: { userId, weak, streak }

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = parseInt(url.searchParams.get('userId'));

  if (!userId) {
    return Response.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    const { results } = await env.DB.prepare(
      'SELECT level, word, wrongs, correct_streak FROM progress WHERE user_id = ?'
    ).bind(userId).all();

    const streakRow = await env.DB.prepare(
      'SELECT streak_count, last_date FROM streaks WHERE user_id = ?'
    ).bind(userId).first();

    // 轉換為弱點庫格式
    const weak = {};
    for (const row of results) {
      if (!weak[row.level]) weak[row.level] = {};
      weak[row.level][row.word] = { wrongs: row.wrongs, streak: row.correct_streak };
    }

    return Response.json({
      weak,
      streak: streakRow
        ? { count: streakRow.streak_count, lastDate: streakRow.last_date }
        : null
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { userId, weak, streak } = await request.json();

    if (!userId) {
      return Response.json({ error: 'Missing userId' }, { status: 400 });
    }

    // 批次寫入所有弱點單字
    const stmts = [];
    for (const [level, words] of Object.entries(weak || {})) {
      for (const [word, data] of Object.entries(words)) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO progress (user_id, level, word, wrongs, correct_streak, updated_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(user_id, level, word) DO UPDATE SET
               wrongs         = excluded.wrongs,
               correct_streak = excluded.correct_streak,
               updated_at     = excluded.updated_at`
          ).bind(userId, level, word, data.wrongs || 0, data.streak || 0)
        );
      }
    }
    if (stmts.length > 0) await env.DB.batch(stmts);

    // 更新連續天數
    if (streak) {
      await env.DB.prepare(
        `INSERT INTO streaks (user_id, streak_count, last_date)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           streak_count = excluded.streak_count,
           last_date    = excluded.last_date`
      ).bind(userId, streak.count || 0, streak.lastDate || '').run();
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
