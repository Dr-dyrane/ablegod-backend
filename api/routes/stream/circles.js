function mountCircleRoutes(router, ctx) {
    require("./circles/publicRoutes")(router, ctx);
    require("./circles/memberRoutes")(router, ctx);
    require("./circles/postRoutes")(router, ctx);
    require("./circles/adminRoutes")(router, ctx);
}

module.exports = mountCircleRoutes;
