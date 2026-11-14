import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { JwtService } from '@nestjs/jwt';
export async function testToken(
  prisma: PrismaService,
  jwt: JwtService,
  userId: string,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const session = await prisma.accountSession.create({
    data: {
      userId,
      authVersion: user.authVersion,
      label: 'Navegador de prueba',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return jwt.sign({ sub: userId, sid: session.id });
}
