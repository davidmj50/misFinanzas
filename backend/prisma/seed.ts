import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_EXPENSE_CATEGORIES = [
  'Alimentación',
  'Transporte',
  'Vivienda',
  'Servicios públicos',
  'Salud',
  'Entretenimiento',
  'Educación',
  'Ropa',
  'Suscripciones',
  'Otros gastos',
];

const DEFAULT_INCOME_CATEGORIES = ['Salario', 'Freelance', 'Inversiones', 'Otros ingresos'];

async function main() {
  const email = process.env.SEED_USER_EMAIL ?? 'demo@misfinanzas.local';
  const password = process.env.SEED_USER_PASSWORD ?? 'changeme123';

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: 'Usuario Demo' },
  });

  const ensureCategory = async (name: string, type: 'EXPENSE' | 'INCOME') => {
    const existing = await prisma.category.findFirst({ where: { userId: user.id, name, parentId: null } });
    if (existing) return existing;
    return prisma.category.create({ data: { userId: user.id, name, type } });
  };

  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    await ensureCategory(name, 'EXPENSE');
  }

  for (const name of DEFAULT_INCOME_CATEGORIES) {
    await ensureCategory(name, 'INCOME');
  }

  console.log(`Seed listo para ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
