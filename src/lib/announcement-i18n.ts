import type { OrganizationRole } from "@/config/roles";
import type { Locale } from "@/lib/i18n";
import type { Database } from "@/types/database";

type AnnouncementStatus = Database["public"]["Enums"]["announcement_status"];
type AnnouncementTargetScope =
  Database["public"]["Enums"]["announcement_target_scope"];

type AnnouncementDictionary = {
  allowComments: string;
  archive: string;
  archivedAt: string;
  author: string;
  backToDraft: string;
  backToAnnouncements: string;
  close: string;
  commentBlocked: string;
  commentDeleted: string;
  commentPlaceholder: string;
  commentSaved: string;
  commentSubmit: string;
  commentUpdated: string;
  comments: string;
  commentsEmpty: string;
  content: string;
  confirmCommentDeleteTitle: string;
  create: string;
  createTitle: string;
  confirmDeleteBody: string;
  confirmDeleteTitle: string;
  cancel: string;
  delete: string;
  description: string;
  edit: string;
  edited: string;
  empty: string;
  hideForWeek: string;
  important: string;
  imageAdd: string;
  imageAttachments: string;
  imageLimit: string;
  imageRemove: string;
  latest: string;
  memberName: string;
  mobileDescription: string;
  mobileEmpty: string;
  noMembers: string;
  organization: string;
  pinned: string;
  publishedForYou: string;
  popupPreview: string;
  publish: string;
  publishedAt: string;
  readAnnouncement: string;
  readAt: string;
  readCount: string;
  readers: string;
  readSummary: string;
  markAsRead: string;
  markedAsRead: string;
  notReadYet: string;
  openList: string;
  roleTargets: string;
  roleLabel: string;
  showPopup: string;
  status: string;
  save: string;
  target: string;
  title: string;
  titleField: string;
  unreadCount: string;
  unreadMembers: string;
  success: {
    created: string;
    deleted: string;
    statusUpdated: string;
  };
  errors: Record<string, string>;
  statuses: Record<AnnouncementStatus, string>;
  targetScopes: Record<AnnouncementTargetScope, string>;
  targetRoles: Record<OrganizationRole, string>;
  maintenance: {
    button: string;
    deleted: string;
    description: string;
    errors: string;
    failed: string;
    listingFailures: string;
    running: string;
    skippedGrace: string;
    skippedReferenced: string;
    title: string;
  };
};

const dictionaries: Record<Locale, AnnouncementDictionary> = {
  ko: {
    allowComments: "\uB313\uAE00 \uD5C8\uC6A9",
    archive: "\uBCF4\uAD00",
    archivedAt: "\uBCF4\uAD00\uC77C",
    author: "\uC791\uC131\uC790",
    backToDraft: "\uC784\uC2DC\uC800\uC7A5",
    backToAnnouncements: "\uACF5\uC9C0 \uBAA9\uB85D\uC73C\uB85C",
    close: "\uB2EB\uAE30",
    commentBlocked:
      "\uC774 \uACF5\uC9C0\uC5D0\uB294 \uB313\uAE00\uC744 \uC791\uC131\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
    commentDeleted: "\uB313\uAE00\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    commentPlaceholder:
      "\uACF5\uC9C0\uC5D0 \uB300\uD55C \uD655\uC778 \uC0AC\uD56D\uC774\uB098 \uACF5\uC720\uD560 \uB0B4\uC6A9\uC744 \uC785\uB825\uD558\uC138\uC694.",
    commentSaved: "\uB313\uAE00\uC774 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    commentSubmit: "\uB313\uAE00 \uB4F1\uB85D",
    commentUpdated: "\uB313\uAE00\uC774 \uC218\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    comments: "\uB313\uAE00",
    commentsEmpty: "\uC544\uC9C1 \uB4F1\uB85D\uB41C \uB313\uAE00\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    cancel: "\uCDE8\uC18C",
    confirmCommentDeleteTitle:
      "\uC815\uB9D0 \uC774 \uB313\uAE00\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?",
    confirmDeleteBody:
      "\uC815\uB9D0 \uC774 \uACF5\uC9C0\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694? \uC0AD\uC81C\uD558\uBA74 \uBC14\uB85C \uBAA9\uB85D\uC5D0\uC11C \uC0AC\uB77C\uC9D1\uB2C8\uB2E4.",
    confirmDeleteTitle:
      "\uC815\uB9D0 \uC774 \uACF5\uC9C0\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?",
    content: "\uB0B4\uC6A9",
    create: "\uC0DD\uC131",
    createTitle: "\uACF5\uC9C0 \uC0DD\uC131",
    delete: "\uC0AD\uC81C",
    description:
      "\uC870\uC9C1 \uACF5\uC9C0\uB97C \uC791\uC131\uD558\uACE0 \uAC8C\uC2DC \uC0C1\uD0DC\uB97C \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
    edit: "\uC218\uC815",
    edited: "\uC218\uC815\uB428",
    empty: "\uC544\uC9C1 \uC0DD\uC131\uB41C \uACF5\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
    hideForWeek: "7\uC77C \uB3D9\uC548 \uB2E4\uC2DC \uBCF4\uC9C0 \uC54A\uAE30",
    important: "\uC911\uC694",
    imageAdd: "\uC774\uBBF8\uC9C0 \uCD94\uAC00",
    imageAttachments: "\uC774\uBBF8\uC9C0 \uCCA8\uBD80",
    imageLimit: "\uCD5C\uB300 5\uC7A5, \uAC01 8MB \uC774\uD558",
    imageRemove: "\uC774\uBBF8\uC9C0 \uC81C\uAC70",
    latest: "\uCD5C\uC2E0 \uACF5\uC9C0",
    memberName: "\uC0AC\uC6A9\uC790",
    mobileDescription:
      "\uB0B4\uAC8C \uACF5\uAC1C\uB41C \uACF5\uC9C0\uB9CC \uBAA8\uC544 \uBCF4\uACE0 \uD544\uC694\uD55C \uB0B4\uC6A9\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.",
    mobileEmpty:
      "\uC544\uC9C1 \uD655\uC778\uD560 \uACF5\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
    noMembers: "\uD45C\uC2DC\uD560 \uC0AC\uC6A9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
    organization: "\uC870\uC9C1",
    pinned: "\uACE0\uC815",
    publishedForYou: "\uB0B4\uAC8C \uACF5\uAC1C\uB41C \uACF5\uC9C0",
    popupPreview: "\uD31D\uC5C5 \uACF5\uC9C0",
    publish: "\uAC8C\uC2DC",
    publishedAt: "\uAC8C\uC2DC\uC77C",
    readAnnouncement: "\uACF5\uC9C0 \uC0C1\uC138",
    readAt: "\uD655\uC778\uC77C",
    readCount: "\uC77D\uC74C",
    readers: "\uC77D\uC740 \uC0AC\uC6A9\uC790",
    readSummary: "\uC77D\uC74C \uD604\uD669",
    markAsRead: "\uC77D\uC74C\uC73C\uB85C \uD655\uC778",
    markedAsRead: "\uC774 \uACF5\uC9C0\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.",
    notReadYet: "\uC544\uC9C1 \uD655\uC778\uD558\uC9C0 \uC54A\uC74C",
    openList: "\uBA85\uB2E8 \uBCF4\uAE30",
    roleTargets: "\uB300\uC0C1 \uC5ED\uD560",
    roleLabel: "\uC5ED\uD560",
    showPopup: "\uC571 \uC2E4\uD589 \uC2DC \uD31D\uC5C5",
    status: "\uC0C1\uD0DC",
    save: "\uC800\uC7A5",
    target: "\uB300\uC0C1",
    title: "\uACF5\uC9C0",
    titleField: "\uC81C\uBAA9",
    unreadCount: "\uBBF8\uD655\uC778",
    unreadMembers: "\uBBF8\uD655\uC778 \uC0AC\uC6A9\uC790",
    success: {
      created: "\uACF5\uC9C0\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
      deleted: "\uACF5\uC9C0\uAC00 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
      statusUpdated:
        "\uACF5\uC9C0 \uC0C1\uD0DC\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    },
    errors: {
      forbidden: "\uACF5\uC9C0 \uAD00\uB9AC \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
      comment_failed: "\uB313\uAE00\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
      comment_forbidden:
        "\uC774 \uACF5\uC9C0\uC5D0 \uB313\uAE00\uC744 \uB0A8\uAE30\uB294 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
      comment_invalid:
        "\uB313\uAE00 \uB0B4\uC6A9\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
      comment_delete_failed:
        "\uB313\uAE00\uC744 \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
      comment_not_found:
        "\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
      comment_update_failed:
        "\uB313\uAE00\uC744 \uC218\uC815\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
      comments_disabled:
        "\uC774 \uACF5\uC9C0\uC5D0\uB294 \uB313\uAE00\uC774 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
      image_count_exceeded:
        "\uC774\uBBF8\uC9C0\uB294 \uCD5C\uB300 5\uC7A5\uAE4C\uC9C0 \uCCA8\uBD80\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      image_size_exceeded:
        "\uC774\uBBF8\uC9C0 1\uC7A5\uC740 8MB \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4.",
      image_type_invalid:
        "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC774\uBBF8\uC9C0 \uD615\uC2DD\uC785\uB2C8\uB2E4. JPEG, PNG, WebP, GIF\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4.",
      invalid_images:
        "\uC774\uBBF8\uC9C0\uB294 5\uC7A5\uAE4C\uC9C0, \uAC01 8MB \uC774\uD558\uB85C \uCCA8\uBD80\uD574 \uC8FC\uC138\uC694.",
      invalid_announcement:
        "\uACF5\uC9C0 \uB0B4\uC6A9\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
      invalid_organization:
        "\uC870\uC9C1\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
      save_failed: "\uACF5\uC9C0\uB97C \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
    },
    statuses: {
      archived: "\uBCF4\uAD00\uB428",
      draft: "\uC784\uC2DC\uC800\uC7A5",
      published: "\uAC8C\uC2DC\uB428",
    },
    targetScopes: {
      everyone: "\uC804\uCCB4",
      roles: "\uC5ED\uD560\uBCC4",
    },
    targetRoles: {
      cs_staff: "CS \uB2F4\uB2F9\uC790",
      field_manager: "\uD604\uC7A5 \uB9E4\uB2C8\uC800",
      office_admin: "\uC624\uD53C\uC2A4 \uAD00\uB9AC\uC790",
      owner: "\uC624\uB108",
      part_time_staff: "\uD30C\uD2B8\uD0C0\uC784 \uC9C1\uC6D0",
      staff: "\uC9C1\uC6D0",
    },
    maintenance: {
      title: "\uC2A4\uD1A0\uB9AC\uC9C0 \uC815\uB9AC",
      description:
        "\uC5C5\uB85C\uB4DC \uD6C4 \uC800\uC7A5\uB418\uC9C0 \uC54A\uC740 \uC774\uBBF8\uC9C0(\uACE0\uC544 \uD30C\uC77C)\uB97C \uC815\uB9AC\uD569\uB2C8\uB2E4. 60\uBD84 \uC720\uC608 \uAE30\uAC04 \uB0B4 \uD30C\uC77C\uACFC DB\uC5D0 \uCC38\uC870\uB41C \uD30C\uC77C\uC740 \uC0AD\uC81C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      button: "\uACE0\uC544 \uC774\uBBF8\uC9C0 \uC815\uB9AC",
      running: "\uC815\uB9AC \uC911\u2026",
      failed:
        "\uC815\uB9AC\uAC00 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB85C\uADF8\uB97C \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.",
      deleted: "\uC0AD\uC81C\uB428",
      skippedGrace: "\uC720\uC608 \uAE30\uAC04 \uB0B4 \uAC74\uB108\uB32C",
      skippedReferenced: "DB \uCC38\uC870 \uAC74\uB108\uB32C",
      errors: "\uC624\uB958",
      listingFailures: "\uBAA9\uB85D \uC870\uD68C \uC2E4\uD328",
    },
  },
  ja: {
    allowComments: "\u30B3\u30E1\u30F3\u30C8\u3092\u8A31\u53EF",
    archive: "\u30A2\u30FC\u30AB\u30A4\u30D6",
    archivedAt: "\u30A2\u30FC\u30AB\u30A4\u30D6\u65E5",
    author: "\u4F5C\u6210\u8005",
    backToDraft: "\u4E0B\u66F8\u304D",
    backToAnnouncements: "\u304A\u77E5\u3089\u305B\u4E00\u89A7\u3078",
    close: "\u9589\u3058\u308B",
    commentBlocked:
      "\u3053\u306E\u304A\u77E5\u3089\u305B\u306B\u306F\u30B3\u30E1\u30F3\u30C8\u3067\u304D\u307E\u305B\u3093\u3002",
    commentDeleted:
      "\u30B3\u30E1\u30F3\u30C8\u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002",
    commentPlaceholder:
      "\u78BA\u8A8D\u4E8B\u9805\u3084\u5171\u6709\u3057\u305F\u3044\u5185\u5BB9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    commentSaved: "\u30B3\u30E1\u30F3\u30C8\u3092\u767B\u9332\u3057\u307E\u3057\u305F\u3002",
    commentSubmit: "\u30B3\u30E1\u30F3\u30C8\u3092\u767B\u9332",
    commentUpdated:
      "\u30B3\u30E1\u30F3\u30C8\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\u3002",
    comments: "\u30B3\u30E1\u30F3\u30C8",
    commentsEmpty:
      "\u307E\u3060\u767B\u9332\u3055\u308C\u305F\u30B3\u30E1\u30F3\u30C8\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
    cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    confirmCommentDeleteTitle:
      "\u3053\u306E\u30B3\u30E1\u30F3\u30C8\u3092\u672C\u5F53\u306B\u524A\u9664\u3057\u307E\u3059\u304B\u3002",
    confirmDeleteBody:
      "\u3053\u306E\u304A\u77E5\u3089\u305B\u3092\u672C\u5F53\u306B\u524A\u9664\u3057\u307E\u3059\u304B\u3002\u524A\u9664\u3059\u308B\u3068\u4E00\u89A7\u304B\u3089\u3059\u3050\u306B\u8868\u793A\u304C\u6D88\u3048\u307E\u3059\u3002",
    confirmDeleteTitle:
      "\u3053\u306E\u304A\u77E5\u3089\u305B\u3092\u672C\u5F53\u306B\u524A\u9664\u3057\u307E\u3059\u304B\u3002",
    content: "\u672C\u6587",
    create: "\u4F5C\u6210",
    createTitle: "\u304A\u77E5\u3089\u305B\u4F5C\u6210",
    delete: "\u524A\u9664",
    description:
      "\u7D44\u7E54\u306E\u304A\u77E5\u3089\u305B\u3092\u4F5C\u6210\u3057\u3001\u516C\u958B\u72B6\u614B\u3092\u7BA1\u7406\u3057\u307E\u3059\u3002",
    edit: "\u7DE8\u96C6",
    edited: "\u7DE8\u96C6\u6E08\u307F",
    empty:
      "\u4F5C\u6210\u3055\u308C\u305F\u304A\u77E5\u3089\u305B\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002",
    hideForWeek: "7\u65E5\u9593\u306F\u518D\u8868\u793A\u3057\u306A\u3044",
    important: "\u91CD\u8981",
    imageAdd: "\u753B\u50CF\u3092\u8FFD\u52A0",
    imageAttachments: "\u753B\u50CF\u6DFB\u4ED8",
    imageLimit: "\u6700\u59275\u679A\u3001\u54048MB\u4EE5\u4E0B",
    imageRemove: "\u753B\u50CF\u3092\u524A\u9664",
    latest: "\u6700\u65B0\u306E\u304A\u77E5\u3089\u305B",
    memberName: "\u30E6\u30FC\u30B6\u30FC",
    mobileDescription:
      "\u81EA\u5206\u306B\u516C\u958B\u3055\u308C\u305F\u304A\u77E5\u3089\u305B\u3060\u3051\u3092\u78BA\u8A8D\u3057\u3001\u5FC5\u8981\u306A\u5185\u5BB9\u3092\u3059\u3050\u306B\u898B\u3089\u308C\u307E\u3059\u3002",
    mobileEmpty:
      "\u78BA\u8A8D\u3067\u304D\u308B\u304A\u77E5\u3089\u305B\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002",
    noMembers:
      "\u8868\u793A\u3067\u304D\u308B\u30E6\u30FC\u30B6\u30FC\u306F\u307E\u3060\u3044\u307E\u305B\u3093\u3002",
    organization: "\u7D44\u7E54",
    pinned: "\u56FA\u5B9A",
    publishedForYou: "\u81EA\u5206\u5411\u3051\u306B\u516C\u958B\u4E2D",
    popupPreview: "\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u304A\u77E5\u3089\u305B",
    publish: "\u516C\u958B",
    publishedAt: "\u516C\u958B\u65E5",
    readAnnouncement: "\u304A\u77E5\u3089\u305B\u8A73\u7D30",
    readAt: "\u78BA\u8A8D\u65E5",
    readCount: "\u65E2\u8AAD",
    readers: "\u65E2\u8AAD\u30E6\u30FC\u30B6\u30FC",
    readSummary: "\u65E2\u8AAD\u72B6\u6CC1",
    markAsRead: "\u65E2\u8AAD\u306B\u3059\u308B",
    markedAsRead:
      "\u3053\u306E\u304A\u77E5\u3089\u305B\u3092\u78BA\u8A8D\u3057\u307E\u3057\u305F\u3002",
    notReadYet: "\u672A\u78BA\u8A8D",
    openList: "\u540D\u7C3F\u3092\u898B\u308B",
    roleTargets: "\u5BFE\u8C61\u30ED\u30FC\u30EB",
    roleLabel: "\u30ED\u30FC\u30EB",
    showPopup:
      "\u30A2\u30D7\u30EA\u8D77\u52D5\u6642\u306B\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7",
    status: "\u72B6\u614B",
    save: "\u4FDD\u5B58",
    target: "\u5BFE\u8C61",
    title: "\u304A\u77E5\u3089\u305B",
    titleField: "\u30BF\u30A4\u30C8\u30EB",
    unreadCount: "\u672A\u8AAD",
    unreadMembers: "\u672A\u8AAD\u30E6\u30FC\u30B6\u30FC",
    success: {
      created: "\u304A\u77E5\u3089\u305B\u3092\u4F5C\u6210\u3057\u307E\u3057\u305F\u3002",
      deleted: "\u304A\u77E5\u3089\u305B\u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002",
      statusUpdated:
        "\u304A\u77E5\u3089\u305B\u306E\u72B6\u614B\u3092\u5909\u66F4\u3057\u307E\u3057\u305F\u3002",
    },
    errors: {
      forbidden:
        "\u304A\u77E5\u3089\u305B\u3092\u7BA1\u7406\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002",
      comment_failed:
        "\u30B3\u30E1\u30F3\u30C8\u3092\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
      comment_forbidden:
        "\u3053\u306E\u304A\u77E5\u3089\u305B\u306B\u30B3\u30E1\u30F3\u30C8\u3059\u308B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002",
      comment_invalid:
        "\u30B3\u30E1\u30F3\u30C8\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      comment_delete_failed:
        "\u30B3\u30E1\u30F3\u30C8\u3092\u524A\u9664\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
      comment_not_found:
        "\u30B3\u30E1\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002",
      comment_update_failed:
        "\u30B3\u30E1\u30F3\u30C8\u3092\u66F4\u65B0\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
      comments_disabled:
        "\u3053\u306E\u304A\u77E5\u3089\u305B\u3067\u306F\u30B3\u30E1\u30F3\u30C8\u304C\u7121\u52B9\u3067\u3059\u3002",
      image_count_exceeded:
        "\u753B\u50CF\u306F\u6700\u59275\u679A\u307E\u3067\u6DFB\u4ED8\u3067\u304D\u307E\u3059\u3002",
      image_size_exceeded:
        "\u753B\u50CF1\u679A\u306F8MB\u4EE5\u4E0B\u3067\u3042\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u3002",
      image_type_invalid:
        "\u30B5\u30DD\u30FC\u30C8\u3055\u308C\u3066\u3044\u306A\u3044\u753B\u50CF\u5F62\u5F0F\u3067\u3059\u3002JPEG\u3001PNG\u3001WebP\u3001GIF\u306E\u307F\u8A31\u53EF\u3055\u308C\u307E\u3059\u3002",
      invalid_images:
        "\u753B\u50CF\u306F5\u679A\u307E\u3067\u3001\u54041\u679A8MB\u4EE5\u4E0B\u3067\u6DFB\u4ED8\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      invalid_announcement:
        "\u304A\u77E5\u3089\u305B\u306E\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      invalid_organization:
        "\u7D44\u7E54\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      save_failed:
        "\u304A\u77E5\u3089\u305B\u3092\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
    },
    statuses: {
      archived: "\u30A2\u30FC\u30AB\u30A4\u30D6\u6E08\u307F",
      draft: "\u4E0B\u66F8\u304D",
      published: "\u516C\u958B\u4E2D",
    },
    targetScopes: {
      everyone: "\u5168\u54E1",
      roles: "\u30ED\u30FC\u30EB\u5225",
    },
    targetRoles: {
      cs_staff: "CS\u62C5\u5F53",
      field_manager: "\u73FE\u5834\u30DE\u30CD\u30FC\u30B8\u30E3\u30FC",
      office_admin: "\u30AA\u30D5\u30A3\u30B9\u7BA1\u7406\u8005",
      owner: "\u30AA\u30FC\u30CA\u30FC",
      part_time_staff: "\u30D1\u30FC\u30C8\u30BF\u30A4\u30E0\u30B9\u30BF\u30C3\u30D5",
      staff: "\u30B9\u30BF\u30C3\u30D5",
    },
    maintenance: {
      title: "\u30B9\u30C8\u30EC\u30FC\u30B8\u6574\u7406",
      description:
        "\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u5F8C\u306B\u4FDD\u5B58\u3055\u308C\u306A\u304B\u3063\u305F\u753B\u50CF\uFF08\u5B64\u7ACB\u30D5\u30A1\u30A4\u30EB\uFF09\u3092\u6574\u7406\u3057\u307E\u3059\u300260\u5206\u306E\u7336\u4E88\u671F\u9593\u5185\u306E\u30D5\u30A1\u30A4\u30EB\u3068DB\u3067\u53C2\u7167\u3055\u308C\u3066\u3044\u308B\u30D5\u30A1\u30A4\u30EB\u306F\u524A\u9664\u3057\u307E\u305B\u3093\u3002",
      button: "\u5B64\u7ACB\u753B\u50CF\u3092\u6574\u7406",
      running: "\u6574\u7406\u4E2D\u2026",
      failed:
        "\u6574\u7406\u306F\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002\u30ED\u30B0\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      deleted: "\u524A\u9664\u6E08\u307F",
      skippedGrace: "\u7336\u4E88\u671F\u9593\u5185\u306E\u305F\u3081\u30B9\u30AD\u30C3\u30D7",
      skippedReferenced: "DB\u53C2\u7167\u306E\u305F\u3081\u30B9\u30AD\u30C3\u30D7",
      errors: "\u30A8\u30E9\u30FC",
      listingFailures: "\u4E00\u89A7\u53D6\u5F97\u5931\u6557",
    },
  },
  en: {
    allowComments: "Allow comments",
    archive: "Archive",
    archivedAt: "Archived",
    author: "Author",
    backToDraft: "Draft",
    backToAnnouncements: "Back to announcements",
    close: "Close",
    commentBlocked: "Comments are not available for this announcement.",
    commentDeleted: "Comment deleted.",
    commentPlaceholder:
      "Add a confirmation note or a message to share with the team.",
    commentSaved: "Comment posted.",
    commentSubmit: "Post comment",
    commentUpdated: "Comment updated.",
    comments: "Comments",
    commentsEmpty: "There are no comments yet.",
    cancel: "Cancel",
    confirmCommentDeleteTitle: "Delete this comment?",
    confirmDeleteBody:
      "Delete this announcement? Once deleted, it disappears from the list immediately.",
    confirmDeleteTitle: "Delete this announcement?",
    content: "Content",
    create: "Create",
    createTitle: "Create announcement",
    delete: "Delete",
    description: "Create organization announcements and manage publish status.",
    edit: "Edit",
    edited: "Edited",
    empty: "No announcements have been created yet.",
    hideForWeek: "Do not show again for 7 days",
    important: "Important",
    imageAdd: "Add images",
    imageAttachments: "Image attachments",
    imageLimit: "Up to 5 images, 8MB or less each",
    imageRemove: "Remove image",
    latest: "Latest announcements",
    memberName: "User",
    mobileDescription:
      "See only the announcements published for you and open the details you need right away.",
    mobileEmpty: "There are no announcements for you yet.",
    noMembers: "There are no users to show.",
    organization: "Organization",
    pinned: "Pinned",
    publishedForYou: "Published for you",
    popupPreview: "Popup announcement",
    publish: "Publish",
    publishedAt: "Published",
    readAnnouncement: "Announcement detail",
    readAt: "Read at",
    readCount: "Read",
    readers: "Readers",
    readSummary: "Read status",
    markAsRead: "Mark as read",
    markedAsRead: "You have read this announcement.",
    notReadYet: "Not read yet",
    openList: "Open list",
    roleTargets: "Target roles",
    roleLabel: "Role",
    showPopup: "Show popup on app open",
    status: "Status",
    save: "Save",
    target: "Target",
    title: "Announcements",
    titleField: "Title",
    unreadCount: "Unread",
    unreadMembers: "Unread users",
    success: {
      created: "Announcement created.",
      deleted: "Announcement deleted.",
      statusUpdated: "Announcement status updated.",
    },
    errors: {
      forbidden: "You do not have permission to manage announcements.",
      comment_failed: "Could not save comment.",
      comment_forbidden:
        "You do not have permission to comment on this announcement.",
      comment_invalid: "Check the comment content.",
      comment_delete_failed: "Could not delete comment.",
      comment_not_found: "Could not find that comment.",
      comment_update_failed: "Could not update comment.",
      comments_disabled: "Comments are disabled for this announcement.",
      image_count_exceeded: "You can attach up to 5 images.",
      image_size_exceeded: "Each image must be 8MB or less.",
      image_type_invalid:
        "Unsupported image format. Only JPEG, PNG, WebP, and GIF are allowed.",
      invalid_images: "Attach up to 5 images, 8MB or less each.",
      invalid_announcement: "Check the announcement details.",
      invalid_organization: "Choose an organization.",
      save_failed: "Could not save announcement.",
    },
    statuses: {
      archived: "Archived",
      draft: "Draft",
      published: "Published",
    },
    targetScopes: {
      everyone: "Everyone",
      roles: "By role",
    },
    targetRoles: {
      cs_staff: "CS Staff",
      field_manager: "Field Manager",
      office_admin: "Office Admin",
      owner: "Owner",
      part_time_staff: "Part-time Staff",
      staff: "Staff",
    },
    maintenance: {
      title: "Storage maintenance",
      description:
        "Remove images uploaded but never saved to an announcement (orphaned files). Files within the 60-minute grace period and files referenced in the database are not deleted.",
      button: "Clean up orphaned images",
      running: "Cleaning up…",
      failed: "Cleanup did not complete. Check logs and try again.",
      deleted: "Deleted",
      skippedGrace: "Skipped (grace period)",
      skippedReferenced: "Skipped (DB referenced)",
      errors: "Errors",
      listingFailures: "Listing failures",
    },
  },
};

export function getAnnouncementDictionary(locale: Locale) {
  return dictionaries[locale];
}
