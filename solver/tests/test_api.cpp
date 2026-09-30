#include <gtest/gtest.h>

#include <string>

#include "sovopt/sovopt.h"

TEST(Api, VersionIsNonEmpty) {
    ASSERT_NE(sovopt_version(), nullptr);
    EXPECT_FALSE(std::string(sovopt_version()).empty());
}

TEST(Api, StatusNames) {
    EXPECT_STREQ(sovopt_status_name(SOVOPT_STATUS_OPTIMAL), "OPTIMAL");
    EXPECT_STREQ(sovopt_status_name(SOVOPT_STATUS_INFEASIBLE), "INFEASIBLE");
}
