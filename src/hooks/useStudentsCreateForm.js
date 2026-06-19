import { useState, useMemo } from 'react';
import { LEAD_ORIGIN } from '../store/useLeadStore';
import { useStudentStore } from '../store/useStudentStore';
import { useUiStore } from '../store/useUiStore';
import { STUDENT_STATUS } from '../lib/studentStatus.js';
import { profileTypeFromTurma, turmaValueFromForm } from '../lib/academyTurmas.js';
import { performEnrollment } from '../lib/performEnrollment.js';
import { maskPhone } from '../lib/masks.js';
import { friendlyError } from '../lib/errorMessages.js';
import { formatLocalYmd } from '../lib/studentEnrollmentDate.js';
import {
  graduationsActive,
  normalizeBeltValue,
  resolveBeltOptions,
} from '../lib/beltGradesConfig.js';

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

const INITIAL_STUDENT = {
  name: '',
  phone: '',
  email: '',
  turmaSelect: '',
  turmaOther: '',
  origin: LEAD_ORIGIN[0] || 'Cadastro manual',
  plan: '',
  belt: '',
};

/**
 * Formulário de cadastro rápido de aluno na lista.
 */
export function useStudentsCreateForm({
  academyId,
  academyList,
  userId,
  terms,
  onCreated,
}) {
  const addToast = useUiStore((s) => s.addToast);
  const addStudent = useStudentStore((s) => s.addStudent);

  const academySettingsRaw = useMemo(() => {
    const acadDoc = (academyList || []).find((a) => a.id === academyId) || {};
    return acadDoc.settings ?? null;
  }, [academyList, academyId]);

  const showGraduationField = useMemo(
    () => graduationsActive(academySettingsRaw),
    [academySettingsRaw]
  );

  const beltOptions = useMemo(
    () => resolveBeltOptions(academySettingsRaw, ''),
    [academySettingsRaw]
  );

  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [newStudent, setNewStudent] = useState(INITIAL_STUDENT);
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');

  const resetNewStudentForm = () => {
    setNewStudent({
      ...INITIAL_STUDENT,
      origin: LEAD_ORIGIN[0] || 'Cadastro manual',
    });
    setPhoneError('');
    setEmailError('');
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    if (creatingStudent) return;
    const name = String(newStudent.name || '').trim();
    const planName = String(newStudent.plan || '').trim();
    if (!name) {
      addToast({ type: 'warning', message: `Informe o nome do ${terms.student.toLowerCase()}.` });
      return;
    }
    if (!planName) {
      addToast({ type: 'warning', message: 'Selecione o plano para matricular o aluno.' });
      return;
    }
    const cleanPhone = normalizePhone(newStudent.phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      setPhoneError('Telefone obrigatório (mínimo 10 dígitos)');
      return;
    }
    const emailTrim = String(newStudent.email || '').trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setEmailError('E-mail inválido');
      return;
    }
    setEmailError('');
    setPhoneError('');
    setCreatingStudent(true);
    try {
      const turma = turmaValueFromForm(newStudent.turmaSelect, newStudent.turmaOther);
      let belt = '';
      if (showGraduationField) {
        try {
          belt = normalizeBeltValue(newStudent.belt, academySettingsRaw, '', {
            invalidMessage: `Selecione uma ${String(terms.belt || 'graduação').toLowerCase()} válida.`,
          });
        } catch (e) {
          addToast({ type: 'error', message: e?.message || 'Graduação inválida.' });
          setCreatingStudent(false);
          return;
        }
      }
      const created = await addStudent({
        name,
        phone: cleanPhone,
        email: emailTrim,
        turma,
        type: profileTypeFromTurma(turma),
        origin: newStudent.origin || 'Cadastro manual',
        plan: planName,
        dueDay: new Date().getDate(),
        enrollmentDate: formatLocalYmd(new Date()),
        studentStatus: STUDENT_STATUS.ACTIVE,
        ...(belt ? { belt } : {}),
      });
      const acadDoc = (academyList || []).find((a) => a.id === academyId) || {};
      await performEnrollment({
        lead: created,
        academyId,
        userId,
        plan: planName,
        source: 'direct',
        permissionContext: {
          teamId: acadDoc.teamId || '',
          userId: userId || '',
        },
        academySettingsRaw: acadDoc.settings,
        onToast: (msg) => addToast({ type: 'info', message: msg }),
      });
      addToast({ type: 'success', message: `${terms.student} cadastrado com sucesso.` });
      setShowCreateStudent(false);
      resetNewStudentForm();
      if (created?.id) onCreated?.(created.id);
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err, 'save') });
    } finally {
      setCreatingStudent(false);
    }
  };

  return {
    showCreateStudent,
    setShowCreateStudent,
    creatingStudent,
    newStudent,
    setNewStudent,
    phoneError,
    setPhoneError,
    emailError,
    setEmailError,
    resetNewStudentForm,
    handleCreateStudent,
    maskPhone,
    showGraduationField,
    beltOptions,
  };
}
