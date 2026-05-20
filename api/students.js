/**
 * API de alunos: freeze, deactivate, profile.
 * Rotas via vercel.json → ?action=freeze|deactivate|profile&student_id=
 */
import studentsHandler from '../lib/server/studentsHandler.js';

export default function handler(req, res) {
  return studentsHandler(req, res);
}
