import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserModule } from './modules/users/user.module';
import {
  User,
  UserDocument,
  UserRole,
} from './modules/users/models/user.model';
import { MailService } from './modules/email/email.service';
import { JwtService } from '@nestjs/jwt';
import { ComplaintModule } from './modules/complaints/complaint.module';
import { Model } from 'mongoose';

describe.skip('RBAC e2e', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let userModel: Model<UserDocument>;
  let jwt: JwtService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        UserModule,
        ComplaintModule,
      ],
    })
      .overrideProvider(MailService)
      .useValue({ send: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userModel = moduleFixture.get<Model<UserDocument>>(
      getModelToken(User.name),
    );
    jwt = moduleFixture.get(JwtService);

    await userModel.create({
      email: 'admin@test.com',
      password: 'pass1234',
      name: 'Admin',
      role: UserRole.ADMIN,
    });
    await userModel.create({
      email: 'lec@test.com',
      password: 'pass1234',
      name: 'Lec',
      role: UserRole.LECTURER,
    });
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  function loginPayload(user: UserDocument) {
    return jwt.sign({
      email: user.email,
      role: user.role,
      sub: user._id.toString(),
    });
  }

  it('prevents lecturer from listing users', async () => {
    const lec = await userModel.findOne({ email: 'lec@test.com' }).exec();
    const token = loginPayload(lec!);
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows admin to list users', async () => {
    const admin = await userModel.findOne({ email: 'admin@test.com' }).exec();
    const token = loginPayload(admin!);
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('blocks lecturer from inviting', async () => {
    const lec = await userModel.findOne({ email: 'lec@test.com' }).exec();
    const token = loginPayload(lec!);
    await request(app.getHttpServer())
      .post('/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x', email: 'x@y.com', role: 'lecturer' })
      .expect(403);
  });

  it('allows public complaint creation', async () => {
    await request(app.getHttpServer())
      .post('/complaints')
      .send({ examCode: '1', name: 'n', email: 'e@e.com', content: 'c' })
      .expect(201);
  });

  it('allows admin to view complaints', async () => {
    const admin = await userModel.findOne({ email: 'admin@test.com' }).exec();
    const token = loginPayload(admin!);
    await request(app.getHttpServer())
      .get('/complaints')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
