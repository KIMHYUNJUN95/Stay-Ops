# Deployment Strategy

## Requirement

StayOps must be usable on both iPhone and Android even before public App Store / Google Play release.

The product may start as an internal company app before public launch.

The first stage must be free/low-cost, and Apple Developer account is not expected to be available immediately.

## Target Platforms

Required:

- iOS
- Android
- Admin web

## Public Store Release

Public store release is not planned immediately.

However, the app should be designed so it can later be released through:

- Apple App Store
- Google Play Store

## Internal Use Before Store Release

Possible approaches:

### PWA

Recommended for first stage.

Pros:

- No Apple Developer account required to start
- No Google Play Console account required to start
- Works on iPhone, Android, and desktop
- Can be added to home screen

Important:

- iPhone web push requires iOS 16.4+ and Home Screen installation.
- Staff onboarding should include "Add to Home Screen" instructions.

### iOS

Options:

- TestFlight
- Apple Business Manager / Custom App later if needed
- Development/internal builds for limited testing

### Android

Options:

- Internal app sharing
- Closed testing track
- APK/AAB internal distribution depending on setup

## Notification Requirement

Push notifications are important and must work on mobile devices.

The notification system should also support an in-app notification center that can be viewed from:

- Mobile app
- Admin web

## Technical Implication

If using React Native + Expo:

- EAS Build should be evaluated for internal iOS/Android builds.
- Push notification setup must be tested on real devices.
- Apple/Google developer account requirements should be checked before implementation.

## Open Questions

- How many internal iPhone users need access?
- How many internal Android users need access?
- Should the first internal version use TestFlight for iOS?
- Should Android use closed testing or direct APK distribution?

## Developer Account Status

Current status:

- Apple Developer account: not available yet
- Google Play Console account: not available yet

Required before reliable internal mobile distribution:

- Create Apple Developer account
- Create Google Play Console account

Priority:

- Apple Developer account is especially important for iPhone testing and TestFlight distribution.

Current recommendation:

- Start with PWA before creating developer accounts.
- Create Apple Developer and Google Play Console accounts later before native app release.

## Initial Web Hosting

Decision:

- Use Vercel for the initial internal PWA/admin web deployment.

Initial domain:

```txt
*.vercel.app
```

Later:

- Add company domain or subdomain if available.
- Consider dedicated product domain before public release.

Reason:

- Fast setup
- Free/low-cost start
- HTTPS support for PWA and Web Push requirements
