const { query } = require("../config/database");

async function createTask({ projectId, title, description, status, priority, dueDate, reporter_id }) {
    const res = await query(
        `INSERT INTO tasks (project_id, title, description, status, priority, due_date, reporter_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [projectId, title, description, status, priority, dueDate, reporter_id]
    );
    return res.rows[0];
}

async function getTasksByProject(projectId) {
    const res = await query(
        "SELECT * FROM tasks WHERE project_id = $1 ORDER BY position ASC",
        [projectId]
    );
    return res.rows;
}

async function getTaskById(id) {
    const result = await query("SELECT * FROM tasks WHERE id = $1", [id]);
    return result.rows[0];
}

async function updateTask(id, data) {
    const allowed = ['title', 'description', 'status', 'priority', 'due_date', 'position', 'assignee_id'];
    const entries = Object.entries(data).filter(([k, v]) => allowed.includes(k) && v !== undefined);

    if (entries.length === 0) return await getTaskById(id);

    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);

    await query(`UPDATE tasks SET ${sets} WHERE id = $${entries.length + 1}`, [...vals, id]);
    return await getTaskById(id);
}

async function deleteTask(id) {
    await query("DELETE FROM tasks WHERE id = $1", [id]);
}

module.exports = {
    createTask,
    getTasksByProject,
    getTaskById,
    updateTask,
    deleteTask,
};