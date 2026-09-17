import { Passport } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { ObjectId, type Db } from 'mongodb';
import type { Config } from './config.js';
import { collections, type UserDoc } from './database.js';
declare global {
  namespace Express {
    interface User extends UserDoc {}
  }
}
declare module 'express-session' {
  interface SessionData {
    csrf?: string;
  }
}
export function createPassport(db: Db, config: Config) {
  const passport = new Passport();
  const { users } = collections(db);
  passport.serializeUser((user, done) => done(null, user._id.toHexString()));
  passport.deserializeUser(async (id: string, done) => {
    try {
      done(null, (await users.findOne({ _id: new ObjectId(id) })) ?? false);
    } catch (error) {
      done(error);
    }
  });
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.GOOGLE_CLIENT_ID,
          clientSecret: config.GOOGLE_CLIENT_SECRET,
          callbackURL: `${config.APP_ORIGIN}/auth/google/callback`,
          state: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const identity = profile._json as {
              email?: string;
              email_verified?: boolean;
              picture?: string;
            };
            if (!identity.email || identity.email_verified !== true)
              return done(null, false, { message: 'A verified Google email is required.' });
            const user = await users.findOneAndUpdate(
              { googleId: profile.id },
              {
                $set: {
                  email: identity.email.trim().toLowerCase(),
                  name: profile.displayName,
                  avatar: identity.picture,
                },
                $setOnInsert: { createdAt: new Date() },
              },
              { upsert: true, returnDocument: 'after' },
            );
            done(null, user ?? false);
          } catch (error) {
            done(error as Error);
          }
        },
      ),
    );
  }
  return passport;
}
