//  Team3332WidgetBundle.swift
//  TEAM 3332 — Widget Extension entry point (618g)
//
//  This is the @main entry for the Widget Extension target. When Xcode creates the
//  extension it generates a default bundle that also includes a Home-Screen widget +
//  a sample Live Activity; you can delete those and keep ONLY RunLiveActivity here.

import WidgetKit
import SwiftUI

@main
struct Team3332WidgetBundle: WidgetBundle {
    var body: some Widget {
        RunLiveActivity()
    }
}
