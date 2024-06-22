import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/dbConfig.js';
import { registerValidation } from '../validations/userValidation.js';

// Función para registrar un nuevo usuario
export const register = async (req, res) => {
  const { id_usuario, nombre, apellido, telefono, email, link_foto, rol, contraseña, empresa, plan } = req.body;

  // Validación de los datos de registro
  const { error } = registerValidation(req.body);
  if (error) return res.status(400).send(error.details[0].message);

  try {
    // Verificar si la empresa ya existe
    const companyExists = await pool.query('SELECT * FROM companies WHERE document_number = $1;', [empresa.document_number]);
    if (companyExists.rows.length > 0) {
      return res.status(409).send('El número de documento de la empresa ya está registrado.');
    }

    // Crear la empresa si no existe
    const result = await pool.query(
      'INSERT INTO companies (name, document_type, document_number, address, city, country, postal_code, email, phone, logo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id;',
      [empresa.name, empresa.document_type, empresa.document_number, empresa.address, empresa.city, empresa.country, empresa.postal_code, empresa.email, empresa.phone, empresa.logo]
    );
    const createdCompanyId = result.rows[0].id;

    // Crear una licencia con las características recibidas en el cuerpo de la solicitud
    await pool.query(
      'INSERT INTO licenses (type, contacts, users, ai_messages, ai_analysis, company_id, integrations, automations, bot_messages, state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);',
      [plan.type, plan.contacts, plan.users, plan.ai_messages, plan.ai_analysis, createdCompanyId, plan.integrations, plan.automations, plan.bot_messages, 'pendiente']
    );

    // Crear el rol con el nombre indicado por el usuario
    const roleResult = await pool.query(
      'INSERT INTO roles (name, company_id, type) VALUES ($1, $2, $3) RETURNING id;',
      [rol, createdCompanyId, 'Humano']
    );
    const createdRoleId = roleResult.rows[0].id;

    // Crear el privilegio "Admin" para el rol creado
    await pool.query(
      'INSERT INTO privileges_roles (name, role_id) VALUES ($1, $2);',
      ['Admin', createdRoleId]
    );

    // Verificar si el usuario ya existe
    const userExists = await pool.query('SELECT * FROM users WHERE id_usuario = $1;', [id_usuario]);
    if (userExists.rows.length > 0) {
      return res.status(409).send('El ID de usuario ya está registrado.');
    }

    // Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const contraseñaHash = await bcrypt.hash(contraseña, salt);

    // Crear el usuario con el rol creado
    await pool.query(
      'INSERT INTO users (id_usuario, nombre, apellido, telefono, email, link_foto, rol, contraseña, company_id, department_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);',
      [id_usuario, nombre, apellido, telefono, email, link_foto, createdRoleId, contraseñaHash, createdCompanyId, null]
    );

    res.status(201).json({ message: "Usuario, empresa, licencia, rol y privilegio creados exitosamente", nombre });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al registrar al usuario, la empresa, la licencia, el rol y el privilegio: ' + err.message);
  }
};

// Función para iniciar sesión
export const login = async (req, res) => {
  const { email, contraseña } = req.body;
  if (!email || !contraseña) {
    return res.status(400).send('Se requieren el correo electrónico y la contraseña');
  }

  try {
    const userQuery = await pool.query(
      'SELECT * FROM users WHERE email = $1;',
      [email]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).send('Usuario no encontrado');
    }

    const user = userQuery.rows[0];
    const validPassword = await bcrypt.compare(contraseña, user.contraseña);
    if (!validPassword) {
      return res.status(401).send('Contraseña incorrecta');
    }

    // Generar el token JWT
    const token = jwt.sign(
      { id_usuario: user.id_usuario, email: user.email, rol: user.rol },
      process.env.JWT_SECRET, // Debe ser una variable de entorno segura
      { expiresIn: '1h' } // El token expirará en 1 hora
    );

    res.status(200).json({
      message: "Inicio de sesión exitoso",
      token,
      user: user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al iniciar sesión');
  }
};

// Función para editar usuario
export const edit = async (req, res) => {
  const { id } = req.params;
  const { nombre, apellido, telefono, email, link_foto, rol, department_id, contraseña } = req.body;

  try {
    // Construir la consulta de actualización
    const updateFields = [];
    const updateValues = [];
    let index = 1;

    if (nombre) {
      updateFields.push(`nombre = $${index++}`);
      updateValues.push(nombre);
    }
    if (apellido) {
      updateFields.push(`apellido = $${index++}`);
      updateValues.push(apellido);
    }
    if (telefono) {
      updateFields.push(`telefono = $${index++}`);
      updateValues.push(telefono);
    }
    if (email) {
      updateFields.push(`email = $${index++}`);
      updateValues.push(email);
    }
    if (link_foto) {
      updateFields.push(`link_foto = $${index++}`);
      updateValues.push(link_foto);
    }
    if (rol) {
      updateFields.push(`rol = $${index++}`);
      updateValues.push(rol);
    }
    if (department_id) {
      updateFields.push(`department_id = $${index++}`);
      updateValues.push(department_id);
    }
    if (contraseña) {
      const hashedPassword = await bcrypt.hash(contraseña, 10);
      updateFields.push(`contraseña = $${index++}`);
      updateValues.push(hashedPassword);
    }

    updateValues.push(id);

    const updateQuery = `
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE id_usuario = $${index}
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, updateValues);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user data:', error);
    res.status(500).send('Internal Server Error');
  }
};

