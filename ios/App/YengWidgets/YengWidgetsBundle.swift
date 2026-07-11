//
//  YengWidgetsBundle.swift
//  YengWidgets
//
//  Home-screen widgets for the Yeng Constantino app.
//  This is the WidgetKit entry point. It lists every widget the
//  extension provides. The actual widget definitions live in
//  YengWidgets.swift.
//

import WidgetKit
import SwiftUI

@main
struct YengWidgetsBundle: WidgetBundle {
    var body: some Widget {
        NextShowWidget()
        FeaturedSongWidget()
        FanTierWidget()
        PastOrdersWidget()
        MyCardsWidget()
    }
}
